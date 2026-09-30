import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function fixture() {
  const state = {values: {count: 3}, callbacks: null, returns: [], writes: []};
  const check = (code, operation) => { if (code) throw Error(`${operation}: ${code}`); };
  const api = {
    open(...args) { state.callbacks = args.slice(-3, -1); args.at(-1).pointer = {}; return 0; },
    thread: () => 'worker', stack: () => 103,
    return(_, value) { state.returns.push(value); return 0; }, cancelReturn() {},
    close: () => 0, active: () => 0, reentrant: () => 0, dispose: () => 0,
  };
  const method = {handle: {}, argumentTypes: [], returnType: {name: 'I'}};
  const Java = {performNow: fn => fn(), vm: {handle: {}}, ClassFactory: {get: () => ({})},
    use: () => ({$className: 'Counter', class: {getClassLoader() {}}, update: {overloads: [method]}})};
  const native = {
    backend: () => api, check, takeString: (_, value) => value,
    readVariable: (_, hit, name) => {
      if (!(name in state.values)) throw Error('Variable not found');
      return state.values[name];
    },
    writeVariable: (_, hit, name, value) => {
      if (typeof value !== 'number') throw Error('Expected number');
      if (name === 'this') throw Error('Cannot replace this');
      state.values[name] = value; state.writes.push(name);
    },
    encode: value => value,
    snapshot: value => value,
  };
  const context = vm.createContext({
    Process: {pointerSize: 8, getCurrentThreadId: () => 1},
    Memory: {alloc: () => ({readPointer() {return this.pointer;}}), allocUtf8String: value => value},
    NativeCallback: function (fn) {return fn;}, setTimeout,
  });
  const module = new vm.SourceTextModule(await readFile(new URL('../sdk/android/probe/debugger/index.js', import.meta.url), 'utf8'), {context});
  await module.link(name => {
    const exports = name.includes('frida-java') ? {default: Java} : name.includes('reporting')
      ? {errorMessage: error => error.message, safeEmit() {}} : native;
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, {context});
  });
  await module.evaluate();
  return {state, async run(config, finishError = 0) {
    const stop = await module.namespace.debuggerProbe({breakpoint: {target: 'Counter', method: 'update', fileLine: 1}, ...config});
    const hit = {toString: () => 'hit'};
    state.callbacks[0](hit); state.callbacks[1](hit, finishError);
    return JSON.parse(JSON.stringify(await stop()));
  }};
}

test('debugger stages expose direct data; earlyReturn reads completed overrides', async () => {
  const f = await fixture();
  const [hit] = await f.run({observations: {before: 'count'}, overrides: {count: 10}, earlyReturn: ({get}) => get('count')});
  assert.deepEqual(hit.observations, {before: 3});
  assert.deepEqual(f.state.returns, [10]);
  assert.equal(hit.errors, undefined);
  assert.equal('overrides' in hit, false); assert.equal('earlyReturn' in hit, false);
});

test('control errors preserve writes, still execute earlyReturn, and have no result envelopes', async () => {
  const f = await fixture();
  const [hit] = await f.run({overrides: {count: 10, other: 'bad'}, earlyReturn: 7});
  assert.equal(f.state.values.count, 10); assert.deepEqual(f.state.returns, [7]);
  assert.deepEqual(hit.errors, [{stage: 'overrides', name: 'other', message: 'Expected number'}]);
  assert.equal('observations' in hit, false);
});

test('stack and deferred native return failures use the same errors list', async () => {
  const f = await fixture();
  const [hit] = await f.run({stack: 2, earlyReturn: 7}, 32);
  assert.deepEqual(hit.errors.map(error => error.stage), ['stack', 'earlyReturn']);
  assert.equal('stack' in hit, false);
});

test('get can be shared within a hit and expires when the hit ends', async () => {
  const f = await fixture(); let saved;
  const [hit] = await f.run({observations: {save: ({get}) => {saved = get; return 1;}, again: () => saved('count'), good: 'count'}});
  assert.deepEqual(hit.observations, {save: 1, again: 3, good: 3});
  assert.equal(hit.errors, undefined);
  assert.throws(() => saved('count'), /breakpoint hit/);
});

test('all actions optional; condition false suppresses writes and hit records', async () => {
  const f = await fixture(); assert.equal((await f.run({})).length, 1);
  const hits = await f.run({breakpoint: {target: 'Counter', method: 'update', fileLine: 1, condition: () => false}, overrides: {count: 10}});
  assert.deepEqual(hits, []); assert.equal(f.state.values.count, 3);
});

test('override callbacks run before target validation; errors do not stop earlyReturn', async () => {
  const f = await fixture(); let computed = false;
  const [hit] = await f.run({observations: {missing: 'missing'}, overrides: {
    this: () => { computed = true; return 1; }, count: 10,
  }, earlyReturn: ({get}) => get('count')});
  assert.equal(computed, true);
  assert.equal(f.state.values.count, 10);
  assert.deepEqual(f.state.returns, [10]);
  assert.deepEqual(hit.errors.map(error => error.stage), ['observations', 'overrides']);
});
