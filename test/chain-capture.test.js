import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function fixture(platform, { memoryFailure = false, clockFailure = false, stackFailure = false, threadFailure = false } = {}) {
  const records = [];
  const sequence = [];
  const listeners = [];
  let time = 10000000000000001n;
  let used = 100;
  let taskCount = 38;
  let taskStatus = memoryFailure ? 5 : 0;
  let calls = 0;
  const failure = new Error('business failed');
  const pointer = value => ({
    toString: () => `0x${BigInt.asUintN(64, BigInt(value)).toString(16)}`,
    toInt32: () => Number(BigInt.asIntN(32, BigInt(value))),
    toUInt32: () => Number(BigInt.asUintN(32, BigInt(value))),
  });
  const memory = size => {
    const buffer = new DataView(new ArrayBuffer(size));
    const at = offset => ({
      add: amount => at(offset + amount),
      writeU32: value => buffer.setUint32(offset, value, true),
      readU32: () => buffer.getUint32(offset, true),
      writeU64: value => buffer.setBigUint64(offset, BigInt(value), true),
      readU64: () => buffer.getBigUint64(offset, true),
    });
    return at(0);
  };
  const nativeFunctions = {
    clock_gettime_nsec_np(clock) { assert.equal(clock, 8); sequence.push('clock'); if (clockFailure) throw Error('clock unavailable'); return time; },
    mach_task_self: () => 7,
    task_info(task, flavor, info, count) {
      assert.equal(task, 7); assert.equal(flavor, 22); assert.equal(count.readU32(), 38);
      sequence.push('memory'); count.writeU32(taskCount); info.add(144).writeU64(used);
      time += 1000n; // Memory collection overhead must not enter elapsedMs.
      return taskStatus;
    },
  };
  const overload = {
    argumentTypes: [{ className: 'int' }], implementation: null,
    call(_receiver, value) {
      calls++; sequence.push('original'); time += 10n; used += 5;
      if (value === -1) throw failure;
      if (value > 0) this.implementation.call(null, value - 1);
      return value + 1;
    },
  };
  const target = { $className: 'Target', run: { overloads: [overload] } };
  const stackCalls = [];
  const Java = {
    vm: { tryGetEnv: () => ({}) },
    backtrace({limit}) {
      stackCalls.push(limit); time += 1000n;
      if (stackFailure) throw Error('stack unavailable');
      return {frames: Array.from({length: limit}, (_, i) => ({className: 'Caller', methodName: 'run' + i, signature: 'run():void', fileName: 'Caller.java', lineNumber: i + 1}))};
    },
    performNow: work => work(),
    use(name) {
      if (name === 'java.lang.Thread') return {currentThread: () => ({getName: () => { if (threadFailure) throw Error('name unavailable'); return 'capture-worker'; }})};
      if (name === 'Target') return target;
      if (name === 'java.lang.System') return { nanoTime: () => { sequence.push('clock'); if (clockFailure) throw Error('clock unavailable'); return time; } };
      if (name === 'java.lang.Runtime') return { getRuntime: () => ({
        totalMemory() { sequence.push('memory'); time += 1000n; if (memoryFailure) throw Error('unavailable'); return used; },
        freeMemory: () => 0,
      }) };
      if (name === 'android.os.Debug') return { getNativeHeapAllocatedSize: () => used };
      throw Error(name);
    },
  };
  const method = { implementation: {}, argumentTypes: ['pointer', 'pointer', 'int'], returnType: 'int' };
  const ObjC = { available: true, classes: { NSThread: {currentThread: () => ({name: () => { if (threadFailure) throw Error('name unavailable'); return 'capture-worker'; }})}, Target: { $className: 'Target', '- run:': method } },
    Object: function (value) { return value; } };
  const context = vm.createContext({
    console: { log: line => records.push(JSON.parse(line.replace('@@MOBILE_EVIDENCE@@', '')).payload), warn() {} },
    send() {},
    Thread: {backtrace(context, kind) {
      assert.equal(context, 'intercepted-context'); assert.equal(kind, 'accurate');
      stackCalls.push(16); time += 1000n;
      if (stackFailure) throw Error('stack unavailable');
      return Array.from({length: 16}, (_, i) => pointer(i + 1));
    }},
    Backtracer: {ACCURATE: 'accurate'},
    DebugSymbol: {fromAddress: () => ({moduleName: 'ApiDemo', name: 'caller', fileName: 'Caller.m', lineNumber: 42})},
    Process: { pointerSize: 8, arch: 'arm64' },
    Module: { getGlobalExportByName: name => { if (!nativeFunctions[name]) throw Error(name); return nativeFunctions[name]; } },
    NativeFunction: function (fn) { return fn; }, Memory: { alloc: memory }, ptr: value => pointer(value),
    Interceptor: { attach(_target, callbacks) {
      const listener = { callbacks, detached: false, detach() { this.detached = true; } };
      listeners.push(listener); return listener;
    } },
  });
  const modules = new Map();
  async function load(url) {
    if (!modules.has(url.href)) modules.set(url.href, new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href }));
    return modules.get(url.href);
  }
  const entry = await load(new URL(`../sdk/${platform}/probe/evidence/chain.js`, import.meta.url));
  await entry.link(async (specifier, parent) => {
    if (specifier.startsWith('frida-')) {
      return new vm.SyntheticModule(['default'], function () { this.setExport('default', platform === 'android' ? Java : ObjC); }, { context });
    }
    return load(new URL(specifier, parent.identifier));
  });
  await entry.evaluate();
  return { records, sequence, stackCalls, context, overload, method, listeners, failure,
    calls: () => calls, setTaskCount: n => { taskCount = n; }, setTaskStatus: n => { taskStatus = n; },
    advance() { time += 10n; used += 5; },
    enter(value) { const state = {context: 'intercepted-context'}; listeners[0].callbacks.onEnter.call(state, [{ $className: 'Target' }, pointer(0), pointer(value)]); return state; },
    leave(state, result) { listeners[0].callbacks.onLeave.call(state, pointer(result)); },
    config(source) { return vm.runInContext(`(${source})`, context); },
    run(action, capture, filter) {
      return entry.namespace.withChainEvidence(action, 'capture', undefined, [{
        target: 'Target', ...(platform === 'android' ? { method: 'run' } : { selector: '- run:' }), capture, filter,
      }]);
    },
  };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: capture uses per-call state, measures only original interval, and cleans up`, async () => {
    const f = await fixture(platform);
    const metric = platform === 'android' ? 'javaHeapUsedBytes' : 'physicalFootprintBytes';
    const capture = f.config(`{ args: ({args}) => ({value: args[0]}), result: ({result}) => ({value: result}), timing: true, memory: {metrics: ['${metric}']} }`);
    await f.run(() => {
      if (platform === 'android') assert.equal(f.overload.implementation.call(null, 1), 2);
      else {
        const first = f.enter(1); f.advance();
        const second = f.enter(0); f.advance();
        f.leave(second, 1); f.leave(first, 2);
      }
    }, capture);
    const exits = f.records.filter(r => r.phase === 'leave');
    assert.deepEqual(f.records.filter(r => r.phase === 'enter').map(r => r.capture.args.value), [1, 0]);
    assert.ok(exits.every(r => !Object.hasOwn(r.capture, 'args')));
    assert.deepEqual(exits.map(r => r.capture.result.value), [1, 2]);
    assert.equal(exits[0].capture.elapsedMs, 0.00001);
    assert.equal(exits[0].capture.memory[metric].delta, 5);
    assert.equal(exits[1].capture.memory[metric].delta, 10);
    assert.equal(exits[1].capture.elapsedMs, 0.00202, 'parent includes nested probe overhead');
    assert.ok(exits.every(r => !('invocationId' in r)));
    if (platform === 'android') assert.equal(f.overload.implementation, null);
    else assert.equal(f.listeners[0].detached, true);
  });

  test(`${platform}: capture failures are evidence, not business failures`, async () => {
    const f = await fixture(platform, { memoryFailure: true });
    const metric = platform === 'android' ? 'javaHeapUsedBytes' : 'physicalFootprintBytes';
    const capture = f.config(`{ args: () => Promise.resolve(1), result: () => { throw Error('extract failed'); }, timing: true, memory: {metrics: ['${metric}']} }`);
    const result = await f.run(() => {
      if (platform === 'android') return f.overload.implementation.call(null, 0);
      const state = f.enter(0); f.advance(); f.leave(state, 1); return 1;
    }, capture);
    assert.equal(result, 1);
    const output = f.records.at(-1).capture;
    assert.equal(output.memory[metric].before, null);
    assert.equal(output.memory[metric].delta, null);
    assert.equal(output.elapsedMs, 0.00001);
    assert.deepEqual(f.records[0].capture.captureErrors.map(e => e.field), ['args']);
    assert.deepEqual(output.captureErrors.map(e => e.field), [`memory.${metric}.before`, `memory.${metric}.after`, 'result']);
  });

  test(`${platform}: disabled capture and filtered calls do not read metrics`, async () => {
    const f = await fixture(platform);
    await f.run(() => {
      if (platform === 'android') f.overload.implementation.call(null, 0);
      else { const state = f.enter(0); f.leave(state, 1); }
    });
    assert.ok(f.records.every(r => !('capture' in r)));
    assert.equal(f.sequence.includes('memory'), false);
    assert.equal(f.sequence.includes('clock'), false);
    const g = await fixture(platform);
    await g.run(() => {
      if (platform === 'android') g.overload.implementation.call(null, 0);
      else { const state = g.enter(0); g.leave(state, 1); }
    }, g.config('{timing:true}'), () => false);
    assert.equal(g.records.length, 0);
    assert.equal(g.sequence.includes('clock'), false);
  });

  test(`${platform}: invalid capture rejects before action`, async () => {
    const f = await fixture(platform);
    for (const capture of [{ timing: 'yes' }, { memory: { metrics: ['invalid'] } }, { args: 1 }, { memory: { metrics: [] } }]) {
      await assert.rejects(f.run(() => assert.fail('must not run'), capture));
    }
  });
}

test('Android throw retains original error and completes capture without result callback', async () => {
  const f = await fixture('android');
  await assert.rejects(f.run(() => f.overload.implementation.call(null, -1), f.config(`{
    args: ({args}) => args[0], result: () => { throw Error('should not run'); }, timing: true,
    memory: {metrics: ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes']}
  }`)), error => error === f.failure);
  assert.equal(f.calls(), 1);
  const record = f.records.at(-1);
  assert.equal(record.phase, 'throw'); assert.equal(record.error, 'business failed');
  assert.equal(f.records[0].capture.args, -1);
  assert.equal(record.capture.args, undefined); assert.equal(record.capture.elapsedMs, 0.00001);
  assert.equal(record.capture.memory.nativeHeapAllocatedBytes.delta, 5);
  assert.equal(record.capture.captureErrors, undefined);
  assert.equal(f.overload.implementation, null);
});

test('iOS rejects unsupported ABI extraction without preventing timing or corrupting calls', async () => {
  const f = await fixture('ios');
  f.method.argumentTypes = ['pointer', 'pointer', 'double']; f.method.returnType = 'double';
  await f.run(() => { const state = f.enter(0); f.advance(); f.leave(state, 0); }, f.config('{args: ({args}) => args, result: ({result}) => result, timing:true}'));
  assert.deepEqual(f.records[0].capture.captureErrors.map(e => e.field), ['args']);
  assert.deepEqual(f.records.at(-1).capture.captureErrors.map(e => e.field), ['result']);
  assert.equal(f.records.at(-1).capture.elapsedMs, 0.00001);
});

test('iOS checks returned TASK_VM_INFO revision and does not manufacture zero readings', async () => {
  const f = await fixture('ios'); f.setTaskCount(36);
  await f.run(() => { const state = f.enter(0); f.leave(state, 1); }, f.config("{memory:{metrics:['physicalFootprintBytes']}}"));
  assert.equal(f.records.at(-1).capture.memory.physicalFootprintBytes.after, null);
  assert.match(f.records.at(-1).capture.captureErrors[0].message, /lacks phys_footprint/);
});

test('iOS overlapping invocations can complete out of entry order without IDs', async () => {
  const f = await fixture('ios');
  await f.run(() => {
    const first = f.enter(10); f.advance();
    const second = f.enter(20); f.advance();
    f.leave(first, 11); f.advance(); f.leave(second, 21);
  }, f.config('{args: ({args}) => args[0], result: ({result}) => result, timing:true}'));
  assert.deepEqual(f.records.filter(r => r.phase === 'leave').map(r => r.capture), [
    { elapsedMs: 0.00002, result: 11 }, { elapsedMs: 0.00002, result: 21 },
  ]);
});

test('iOS integer widths and 64-bit return values are decoded without precision loss', async () => {
  const f = await fixture('ios');
  f.method.argumentTypes = ['pointer', 'pointer', 'int8'];
  f.method.returnType = 'uint64';
  await f.run(() => { const state = f.enter(255); f.leave(state, 18446744073709551615n); },
    f.config('{args: ({args}) => args[0], result: ({result}) => result}'));
  assert.deepEqual(f.records[0].capture, {args: -1});
  assert.deepEqual(f.records.at(-1).capture, {result: '18446744073709551615'});
});

for (const platform of ['android', 'ios']) {
  test(`${platform}: args are published before the original call and output is excluded from timing`, async () => {
    const f = await fixture(platform);
    const originalLog = f.context.console.log;
    f.context.console.log = line => { originalLog(line); f.advance(); };
    await f.run(() => {
      if (platform === 'android') {
        const original = f.overload.call;
        f.overload.call = function (...args) {
          assert.equal(f.records[0].phase, 'enter');
          assert.equal(f.records[0].capture.args, 0);
          return original.apply(this, args);
        };
        f.overload.implementation.call(null, 0);
      } else {
        const state = f.enter(0);
        assert.equal(f.records[0].capture.args, 0);
        f.advance(); f.leave(state, 1);
      }
    }, f.config('{args: ({args}) => args[0], timing:true}'));
    assert.equal(f.records.at(-1).capture.elapsedMs, 0.00001);
    assert.equal(f.records.at(-1).capture.args, undefined);
  });
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: clock read failure omits elapsedMs while preserving result and memory`, async () => {
    const f = await fixture(platform, {clockFailure: true});
    const metric = platform === 'android' ? 'javaHeapUsedBytes' : 'physicalFootprintBytes';
    await f.run(() => {
      if (platform === 'android') return f.overload.implementation.call(null, 0);
      const state = f.enter(0); f.advance(); f.leave(state, 1); return 1;
    }, f.config(`{result: ({result}) => result, timing:true, memory:{metrics:['${metric}']}}`));
    const capture = f.records.at(-1).capture;
    assert.equal(capture.result, 1); assert.equal(capture.elapsedMs, undefined);
    assert.deepEqual(capture.captureErrors.map(e => e.field), ['timing.start', 'timing.end']);
    assert.equal(capture.memory[metric].delta, 5);
  });
}

for (const platform of ['android', 'ios']) {
  const invoke = f => {
    if (platform === 'android') return f.overload.implementation.call(null, 0);
    const state = f.enter(0); f.advance(); f.leave(state, 1); return 1;
  };
  test(`${platform}: entry stacks default to five, custom depth, disabled and error isolation`, async () => {
    for (const [stack, depth] of [[true, 5], [{}, 5], [{maxFrames: 1}, 1], [{maxFrames: platform === 'ios' ? 16 : 64}, platform === 'ios' ? 16 : 64], [false, 0], [undefined, 0]]) {
      const f = await fixture(platform);
      await f.run(() => invoke(f), {stack, timing: true});
      assert.ok(f.records.every(e => e.threadName === 'capture-worker'));
      if (depth) {
        assert.equal(f.records[0].capture.stack.kind, platform === 'android' ? 'java' : 'native');
        assert.equal(f.records[0].capture.stack.frames.length, depth);
      } else {
        assert.equal(f.records[0].capture, undefined);
        assert.equal(f.stackCalls.length, 0);
      }
      assert.equal(f.records[1].capture.stack, undefined);
      assert.equal(f.records[1].capture.elapsedMs, 0.00001, 'stack collection excluded from method timing');
    }
    const f = await fixture(platform, {stackFailure: true});
    assert.equal(await f.run(() => invoke(f), {stack: true, timing: true}), 1);
    assert.deepEqual(f.records[0].capture.captureErrors, [{field: 'stack', message: 'stack unavailable'}]);
    assert.equal(f.records[1].capture.elapsedMs, 0.00001);
  });
  test(`${platform}: invalid stack configuration rejects and filtered calls skip stack work`, async () => {
    const f = await fixture(platform);
    for (const stack of [null, 1, 'yes', [], {maxFrames: null}, {maxFrames: 0}, {maxFrames: -1}, {maxFrames: 1.5}, {maxFrames: NaN}, {maxFrames: Infinity}, {maxFrames: '5'}, {maxFrames: platform === 'ios' ? 17 : 65}, {unknown: 1}]) {
      await assert.rejects(f.run(() => assert.fail('action must not run'), {stack}));
    }
    await f.run(() => invoke(f), {stack: true}, () => false);
    assert.equal(f.stackCalls.length, platform === 'android' ? 1 : 0, 'only serial Android backend initialization'); assert.equal(f.records.length, 0);
  });
  test(`${platform}: unavailable thread name preserves method and emits null`, async () => {
    const f = await fixture(platform, {threadFailure: true});
    assert.equal(await f.run(() => invoke(f)), 1);
    assert.ok(f.records.every(e => e.threadName === null));
  });
}

test('Android: stack stays on enter when original Java method throws', async () => {
  const f = await fixture('android');
  await assert.rejects(f.run(() => f.overload.implementation.call(null, -1), {stack: true, timing: true}), error => error === f.failure);
  assert.equal(f.records[0].capture.stack.frames.length, 5);
  assert.equal(f.records[1].phase, 'throw'); assert.equal(f.records[1].capture.stack, undefined);
  assert.equal(f.records[1].threadName, 'capture-worker'); assert.equal(f.overload.implementation, null);
});

test('iOS: missing symbols retain native stack addresses', async () => {
  const f = await fixture('ios');
  f.context.DebugSymbol.fromAddress = () => {throw Error('stripped');};
  await f.run(() => {const state = f.enter(0); f.leave(state, 1);}, {stack: true});
  assert.ok(f.records[0].capture.stack.frames.every(frame => frame.address && frame.name === null && frame.moduleName === null));
});

test('Android: initialize the stack backend before hooks run and reuse it across actions', async () => {
  const f = await fixture('android');
  await f.run(() => {
    assert.deepEqual(f.stackCalls, [1], 'serial initialization precedes any application call');
    f.overload.implementation.call(null, 0);
  }, {stack: true});
  await f.run(() => f.overload.implementation.call(null, 0), {stack: true});
  assert.deepEqual(f.stackCalls, [1, 5, 5], 'one initialization and one capture per invocation');
});
