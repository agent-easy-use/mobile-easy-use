import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function fixture(platform) {
  let retains = 0;
  const values = {enabled: 0, mode: 2, object: null, callback: null};
  const target = platform === 'android'
    ? {$className: 'Config', enabled: {value: 0}, mode: {value: 2}, object: {value: null}}
    : {$kind: 'instance', $class: {handle: 'Config'}, $ivars: values,
      retain() { retains++; }, release() { retains--; }};
  const method = {implementation: platform === 'android' ? null : () => 0, argumentTypes: []};
  const methodTarget = platform === 'android'
    ? {$className: 'Config', getValue: {overloads: [method]}}
    : {$className: 'Config', '- value': method};
  const methodDefinition = platform === 'android'
    ? {target: methodTarget, method: 'getValue', withReturn: 9}
    : {target: methodTarget, selector: '- value', withReturn: 9};
  const bridge = platform === 'android'
    ? {performNow: fn => fn(), use: () => target, retain: object => { object.$dispose = () => {}; return object; }}
    : {available: true, implement: (_method, callback) => callback, api: {
      ivar_getTypeEncoding: name => ({readCString: () => name === 'callback' ? '@?' : 'i'}),
    }};
  const context = vm.createContext({Promise, console, Memory: {allocUtf8String: name => name},
    Module: {getGlobalExportByName: name => { assert.equal(name, 'class_getInstanceVariable'); return (_cls, field) => field; }},
    NativeFunction: function (fn) { return fn; },
  });
  const modules = new Map();
  async function getModule(url) {
    if (!modules.has(url.href)) modules.set(url.href, new vm.SourceTextModule(
      await readFile(url, 'utf8'), {context, identifier: url.href}));
    return modules.get(url.href);
  }
  const entry = await getModule(new URL(`../sdk/${platform}/override/index.js`, import.meta.url));
  await entry.link(async (specifier, parent) => {
    if (specifier.startsWith('frida-')) return new vm.SyntheticModule(['default'], function () {
      this.setExport('default', bridge);
    }, {context});
    return getModule(new URL(specifier, parent.identifier));
  });
  await entry.evaluate();
  return {run: entry.namespace.Override.run, target, method, methodDefinition, retains: () => retains,
    read: name => platform === 'android' ? target[name].value : values[name],
    write: (name, value) => { if (platform === 'android') target[name].value = value; else values[name] = value; }};
}

for (const platform of ['android', 'ios']) {
  test(`${platform} fields write once and restore after async action, including App writes`, async () => {
    const f = await fixture(platform);
    let finish;
    const pending = f.run([{target: f.target, field: 'enabled', withValue: 1}], () => {
      assert.equal(f.read('enabled'), 1);
      f.write('enabled', 7);
      return new Promise(resolve => { finish = resolve; });
    });
    assert.equal(f.read('enabled'), 7);
    if (platform === 'ios') assert.equal(f.retains(), 1);
    finish('done');
    assert.equal(await pending, 'done');
    assert.equal(f.read('enabled'), 0);
    assert.equal(f.retains(), 0);
  });

  test(`${platform} fields restore after return, throw, rejection and partial installation failure`, async () => {
    const f = await fixture(platform);
    const definitions = [{target: f.target, field: 'enabled', withValue: 1},
      {target: f.target, field: 'mode', withValue: 4}];
    assert.equal(f.run(definitions, () => f.read('mode')), 4);
    const error = new Error('action failed');
    assert.throws(() => f.run(definitions, () => { throw error; }), e => e === error);
    await assert.rejects(f.run(definitions, () => Promise.reject(error)), e => e === error);
    let called = false;
    assert.throws(() => f.run([...definitions, {target: f.target, field: 'missing', withValue: 1}],
      () => { called = true; }), /not found/);
    assert.equal(called, false);
    assert.equal(f.read('enabled'), 0);
    assert.equal(f.read('mode'), 2);
    assert.equal(f.retains(), 0);
  });

  test(`${platform} fields reject missing values and mixed method options before action`, async () => {
    const f = await fixture(platform);
    for (const extra of [{}, {withValue: 1, withReturn: 2}, {withValue: 1, filter: () => true}]) {
      assert.throws(() => f.run([{target: f.target, field: 'enabled', ...extra}],
        () => assert.fail('action must not run')), /requires/);
    }
    assert.equal(f.read('enabled'), 0);
  });
}

test('Android fields accept class names for static fields and restore object values', async () => {
  const f = await fixture('android');
  const old = {name: 'original'};
  f.write('object', old);
  f.run([{target: 'Config', field: 'object', withValue: null}], () => assert.equal(f.read('object'), null));
  assert.equal(f.read('object'), old);
});

test('iOS fields reject class targets and block ivars; numeric writes retain their owner', async () => {
  const f = await fixture('ios');
  for (const definition of [{target: 'Config', field: 'enabled', withValue: true},
    {target: f.target, field: 'callback', withValue: null}]) {
    assert.throws(() => f.run([definition], () => assert.fail('action must not run')));
  }
  f.run([{target: f.target, field: 'enabled', withValue: true}], () => assert.equal(f.read('enabled'), 1));
  assert.equal(f.read('enabled'), 0);
  assert.equal(f.retains(), 0);
});

for (const platform of ['android', 'ios']) {
  test(`${platform} fields compose with method overrides and roll them back on write failure`, async () => {
    const f = await fixture(platform);
    const original = f.method.implementation;
    const definitions = [f.methodDefinition, {target: f.target, field: 'enabled', withValue: 1}];
    f.run(definitions, () => {
      assert.notEqual(f.method.implementation, original);
      assert.equal(f.read('enabled'), 1);
    });
    assert.equal(f.method.implementation, original);
    const storage = platform === 'android' ? f.target.mode : f.target.$ivars;
    Object.defineProperty(storage, platform === 'android' ? 'value' : 'mode', {
      get: () => 2, set() { throw new Error('write rejected'); },
    });
    assert.throws(() => f.run([...definitions, {target: f.target, field: 'mode', withValue: 3}],
      () => assert.fail('action must not run')), /write rejected/);
    assert.equal(f.read('enabled'), 0);
    assert.equal(f.method.implementation, original);
    assert.equal(f.retains(), 0);
  });
}
