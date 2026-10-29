import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const pointer = value => ({ toString: () => String(value), isNull: () => false,
  equals: other => String(other) === String(value) });

async function fixture(platform, isStatic = false) {
  const events = [], configs = [];
  const state = { retained: 0, originalCalls: 0, stopCalls: 0, failRestore: false, value: 2 };
  const original = (...args) => {
    state.originalCalls++;
    if (state.originalError) throw Error('original failed');
    return args.at(-1) * 2;
  };
  original.equals = other => other === original;
  const selected = { handle: pointer('method'), type: isStatic ? 2 : 3, implementation: platform === 'android' ? null : original,
    argumentTypes: [], call: (_receiver, ...args) => original(...args) };
  if (platform === 'android') {
    let implementation = null;
    Object.defineProperty(selected, 'implementation', {
      get: () => implementation,
      set(fn) { implementation = fn === null ? null : function (...args) { return fn.apply(this, args); }; },
    });
  }
  const numeric = { fieldType: isStatic ? 1 : 2, get value() { return state.value; },
    set value(value) { if (state.failRestore && value === 2) throw Error('restore failed'); state.value = value; } };
  const cls = { $className: 'Counter', $h: null, class: { $isSameObject: obj => obj === cls.class },
    calculate: { overloads: [selected], overload: () => selected }, count: numeric };
  const target = { ...cls, $h: pointer('instance'), $kind: 'instance', handle: pointer('instance'),
    $class: { handle: pointer('class') }, $ivars: {},
    $isSameObject(other) { return this.$h.equals(other.$h); },
    retain() { state.retained++; }, release() { state.retained--; } };
  Object.defineProperty(target.$ivars, 'count', { enumerable: true, get: () => state.value,
    set: value => { numeric.value = value; } });
  target['- count'] = () => state.value;
  target['- setCount:'] = value => { numeric.value = value; };
  const selector = isStatic ? '+ calculate:' : '- calculate:';
  target[selector] = selected; cls[selector] = selected;
  const bridge = platform === 'android' ? {
    performNow: fn => fn(), use: () => cls,
    retain(object) { state.retained++; return { ...object, $dispose() { state.retained--; } }; },
  } : { available: true, Object: function ObjCObject() {},
    implement: (_method, fn) => { fn.equals = other => other === fn; return fn; },
    api: { ivar_getTypeEncoding: () => ({ readCString: () => 'i' }) } };
  const context = vm.createContext({ console, Promise, Int64: class {}, UInt64: class {},
    Memory: { allocUtf8String: value => value }, Module: { getGlobalExportByName: name => name === 'class_getProperty'
      ? () => pointer('property') : name === 'property_copyAttributeValue'
        ? () => ({ isNull: () => true }) : () => {} },
    NativeFunction: function(fn) { return fn; } });
  const modules = new Map();
  const synthetic = (id, values) => {
    if (!modules.has(id)) modules.set(id, new vm.SyntheticModule(Object.keys(values), function() {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: id }));
    return modules.get(id);
  };
  async function load(url) {
    if (!modules.has(url.href)) modules.set(url.href, readFile(url, 'utf8').then(source => new vm.SourceTextModule(source, { context, identifier: url.href })));
    return modules.get(url.href);
  }
  const entry = await load(new URL(`../sdk/${platform}/overrides/index.js`, import.meta.url));
  await entry.link(async (name, parent) => {
    if (name.startsWith('frida-')) return synthetic('bridge', { default: bridge });
    if (name.includes('static-hook')) return synthetic('static', { prepareStaticHook() {} });
    if (name.includes('reporting')) return synthetic('report', { safeEmit: (channel, payload) => events.push({ channel, payload }), errorMessage: e => e.message });
    if (name.includes('runtime.js')) return synthetic('runtime', { IOSRuntime: { findClass: () => cls } });
    if (name.includes('common/debugger')) {
      const install = async config => {
        configs.push(config);
        if (state.installError) throw Error('install failed');
        return async () => { state.stopCalls++; if (state.stopError) throw Error('stop failed'); return [{ errors: [{ stage: 'overrides' }] }]; };
      };
      return synthetic('debugger', { debuggerProbe: install, installDebugger: install });
    }
    return load(new URL(name, parent.identifier));
  });
  await entry.evaluate();
  const definition = platform === 'android'
    ? { className: 'Counter', method: 'calculate' }
    : { className: 'Counter', selector };
  return { ...entry.namespace, state, events, configs, selected, cls, target, definition,
    call(receiver, ...args) { return platform === 'android' ? selected.implementation.apply(receiver, args)
      : selected.implementation(receiver.handle, null, ...args); },
    location: platform === 'android' ? { className: 'Counter', method: 'calculate', fileLine: 42 }
      : { kind: 'source', file: '/project/Counter.m', line: 42 },
  };
}

for (const platform of ['android', 'ios']) {
  for (const codeFirst of [false, true]) {
    test(`${platform}: method and code installation are independent, codeFirst=${codeFirst}`, async () => {
      const f = await fixture(platform);
      const installCode = () => f.override.code(f.location, undefined, platform === 'android' ? 1 : '1');
      const first = codeFirst ? await installCode() : f.override.method(f.definition, 9);
      const second = codeFirst ? f.override.method(f.definition, 9) : await installCode();
      assert.equal(f.call(f.target, 3), 9);
      await second();
      await first();
    });
  }

  test(`${platform}: remove closures clean up their own override independently`, async () => {
    const f = await fixture(platform);
    const method = f.override.method(f.definition, 9);
    const field = f.override.field({ instance: f.target, [platform === 'ios' ? 'property' : 'field']: 'count' }, 10);
    assert.equal(typeof method, 'function');
    assert.equal(typeof field, 'function');
    await field();
    assert.equal(f.state.value, 2);
    assert.equal(f.call(f.target, 3), 9);
    await method();
    assert.equal(f.state.retained, 0);
  });

  test(`${platform}: class method lookup, positional callbacks and original exceptions`, async () => {
    const f = await fixture(platform);
    const remove = f.override.method({ ...f.definition, filter: (a, b) => a > 10 && b === 2 }, (a, b) => a - b);
    assert.equal(f.call(f.target, 20, 2), 18);
    assert.equal(f.call({ $h: pointer('other'), handle: pointer('other') }, 20, 2), 18);
    assert.equal(f.call(f.target, 1, 2), 4);
    f.state.originalError = true;
    assert.throws(() => f.call(f.target, 1, 2), /original failed/);
    assert.equal(f.state.originalCalls, 2, 'original exceptions must not trigger a second call');
    assert.equal(remove(), undefined);
    const restored = f.selected.implementation;
    remove();
    assert.equal(f.selected.implementation, restored);
    assert.equal(f.state.retained, 0);
  });

  test(`${platform}: static methods and synchronous callback enforcement`, async () => {
    const f = await fixture(platform, true);
    assert.throws(() => f.override.method(f.definition, async () => 1), /synchronous/);
    assert.throws(() => f.override.method({ ...f.definition, filter: async () => true }, 9), /synchronous/);
    const remove = f.override.method(f.definition, () => { throw Error('calculation failed'); });
    assert.equal(f.call(f.target, 3), 6);
    assert.equal(f.events[0].payload.phase, 'returnInstead');
    assert.equal(f.events[0].payload.message, 'calculation failed');
    await remove();
  });

  test(`${platform}: field removal restores intervening writes and releases ownership once`, async () => {
    const f = await fixture(platform);
    const def = { instance: f.target, [platform === 'ios' ? 'property' : 'field']: 'count' };
    const remove = f.override.field(def, 10);
    assert.equal(f.state.value, 10);
    assert.throws(() => f.override.field(def, 20), /already/);
    f.state.value = 15;
    assert.equal(remove(), undefined);
    assert.equal(remove(), undefined);
    assert.equal(f.state.value, 2);
    assert.equal(f.state.retained, 0);
    const next = f.override.field(def, 4);
    assert.equal(await next(), undefined);
    assert.equal(f.state.value, 2);
  });

  test(`${platform}: code definition, omitted return, explicit null and cleanup evidence`, async () => {
    const f = await fixture(platform);
    const condition = platform === 'android' ? ({ get }) => get('price') > 100 : 'price > 100';
    const values = platform === 'android' ? { price: 10 } : { price: '10' };
    await assert.rejects(f.override.code(f.location), /Provide/);
    const remove = await f.override.code({ ...f.location, condition }, values, undefined);
    assert.equal(Object.hasOwn(f.configs[0], 'earlyReturn'), false);
    assert.equal(f.configs[0].breakpoint.condition, condition);
    if (platform === 'ios') await assert.rejects(f.override.code(f.location, values), /already/);
    await Promise.all([remove(), remove()]);
    await remove();
    assert.equal(f.state.stopCalls, 1);
    assert.equal(f.events[0].channel, 'override.code');
    assert.equal(f.events[0].payload.location[platform === 'android' ? 'className' : 'file'],
      f.location[platform === 'android' ? 'className' : 'file']);
    if (platform === 'ios') await assert.rejects(f.override.code(f.location, undefined, null), /native expression/);
    const empty = await f.override.code(f.location, undefined, platform === 'android' ? null : '(id)nil');
    assert.equal(f.configs.at(-1).earlyReturn, platform === 'android' ? null : '(id)nil');
    await empty();
  });

  test(`${platform}: code can be installed after a failed attempt`, async () => {
    const f = await fixture(platform);
    f.state.installError = true;
    await assert.rejects(f.override.code(f.location, undefined, platform === 'android' ? 1 : '1'), /install failed/);
    f.state.installError = false;
    const remove = await f.override.code(f.location, undefined, platform === 'android' ? 1 : '1');
    await remove();
  });
}

test('Android rejects an existing implementation and allows replacement after removal', async () => {
  const f = await fixture('android');
  const remove = f.override.method(f.definition, 10);
  assert.throws(() => f.override.method(f.definition, 20), /already has an implementation/);
  assert.equal(f.call(f.target, 3), 10);
  await remove();
  const next = f.override.method(f.definition, 20);
  assert.equal(f.call(f.target, 3), 20);
  await next();
});

test('iOS replacements restore the saved IMP when removed in reverse order', async () => {
  const f = await fixture('ios');
  const original = f.selected.implementation;
  const first = f.override.method(f.definition, 10);
  const second = f.override.method(f.definition, 20);
  assert.equal(f.call(f.target, 3), 20);
  await second();
  assert.equal(f.call(f.target, 3), 10);
  await first();
  assert.equal(f.selected.implementation, original);
});

test('Android static fields require class names and restore original value', async () => {
  const f = await fixture('android', true);
  assert.throws(() => f.override.field({ instance: f.target, field: 'count' }, 9), /class name/);
  const remove = f.override.field({ className: 'Counter', field: 'count' }, 9);
  await remove();
  assert.equal(f.state.value, 2);
});

test('Android field requires exactly one className or instance and the matching member kind', async () => {
  const f = await fixture('android');
  assert.throws(() => f.override.field({ field: 'count' }, 9), /exactly one/);
  assert.throws(() => f.override.field({ className: 'Counter', instance: f.target, field: 'count' }, 9), /exactly one/);
  assert.throws(() => f.override.field({ instance: f.cls, field: 'count' }, 9), /instance wrapper/);
  assert.throws(() => f.override.field({ className: 'Counter', field: 'count' }, 9), /instance fields require an instance/);
  assert.equal(f.state.value, 2);
  assert.equal(f.state.retained, 0);
});

test('iOS field accepts only an instance definition', async () => {
  const f = await fixture('ios');
  assert.throws(() => f.override.field({ className: 'Counter', property: 'count' }, 9), /requires an instance/);
  assert.throws(() => f.override.field({ className: 'Counter', instance: f.target, property: 'count' }, 9), /requires an instance/);
  assert.throws(() => f.override.field({ instance: f.cls, property: 'count' }, 9), /requires an instance/);
  assert.equal(f.state.value, 2);
  assert.equal(f.state.retained, 0);
});

for (const kind of ['string', 'object', 'array', 'null']) {
  test(`Android fields restore Frida getter values and dispose owned references: ${kind}`, async () => {
    const f = await fixture('android');
    let disposed = 0;
    const original = kind === 'string' ? 'hello' : kind === 'null' ? null
      : Object.assign(kind === 'array' ? [1, 2] : {}, { $dispose() { disposed++; } });
    f.state.value = original;
    const remove = f.override.field({ instance: f.target, field: 'count' }, 'mock');
    assert.equal(f.state.value, 'mock');
    f.state.value = 'app update';
    remove();
    remove();
    assert.equal(f.state.value, original);
    assert.equal(disposed, kind === 'object' || kind === 'array' ? 1 : 0);
    assert.equal(f.state.retained, 0);
  });
}
