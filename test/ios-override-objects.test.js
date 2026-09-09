import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function fixture(ownership) {
  const weakSlots = new Set();
  const nil = {object: null};
  class ObjectWrapper {
    constructor() { this.refs = 1; this.handle = {object: this}; }
    retain() { retain(this.handle); }
    release() { release(this.handle); }
  }
  const retain = p => { if (p.object) { assert.ok(p.object.refs > 0); p.object.refs++; } return p; };
  const release = p => {
    if (p.object && --p.object.refs === 0) {
      for (const slot of weakSlots) if (slot.value === p) slot.value = nil;
    }
    if (p.object) assert.ok(p.object.refs >= 0);
  };
  const slot = {value: nil, readPointer() { return this.value; }};
  const storeStrong = (where, value) => { const old = where.value; retain(value); where.value = value; release(old); };
  const storeWeak = (where, value) => { where.value = value; weakSlots.add(where); return value; };
  const original = new ObjectWrapper();
  const mock = new ObjectWrapper();
  if (ownership === 1) { storeStrong(slot, original.handle); original.release(); }
  else storeWeak(slot, original.handle);
  const target = new ObjectWrapper();
  Object.assign(target, {$kind: 'instance', $class: {handle: 'Config'}, $ivars: {_value: true}});
  target.handle.add = () => slot;
  let backup;
  const functions = {
    class_getInstanceVariable: () => 'ivar',
    _class_getIvarMemoryManagement: () => ownership,
    objc_retain: retain, objc_release: release, objc_storeStrong: storeStrong,
    objc_copyWeak: (dest, src) => { backup = dest; storeWeak(dest, src.value); },
    objc_loadWeakRetained: where => retain(where.value), objc_storeWeak: storeWeak,
    objc_destroyWeak: where => weakSlots.delete(where),
  };
  const ObjC = {Object: ObjectWrapper, api: {
    ivar_getTypeEncoding: () => ({readCString: () => '@"NSObject"'}),
    ivar_getOffset: () => ({toInt32: () => 8}),
  }};
  const context = vm.createContext({NULL: nil, Process: {pointerSize: 8},
    Memory: {allocUtf8String: x => x, alloc: () => ({value: nil})},
    Module: {getGlobalExportByName: name => { assert.ok(functions[name], name); return functions[name]; }},
    NativeFunction: function (fn) { return fn; },
  });
  const entry = new vm.SourceTextModule(await readFile(new URL('../sdk/ios/override/fields.js', import.meta.url), 'utf8'), {context});
  await entry.link(() => new vm.SyntheticModule(['default'], function () { this.setExport('default', ObjC); }, {context}));
  await entry.evaluate();
  return {original, mock, target, slot, nil, storeStrong, storeWeak, backup: () => backup,
    registered: () => weakSlots.size, install: value => entry.namespace.installField({target, field: '_value', withValue: value})};
}

test('iOS object fields hold mock through intervening writes and restore strong identity', async () => {
  const f = await fixture(1);
  const restore = f.install(f.mock);
  f.mock.release();
  assert.equal(f.original.refs, 1);
  f.storeStrong(f.slot, f.nil);
  assert.equal(f.mock.refs, 1, 'SDK owns mock even after App removes it');
  restore();
  assert.equal(f.slot.value, f.original.handle);
  assert.equal(f.original.refs, 1);
  assert.equal(f.mock.refs, 0);
  assert.equal(f.target.refs, 1);
});

for (const expires of [false, true]) {
  test(`iOS object fields restore native weak backup when original expires=${expires}`, async () => {
    const f = await fixture(2);
    const restore = f.install(f.mock);
    f.mock.release();
    assert.equal(f.original.refs, 1, 'backup must not own original');
    if (expires) f.original.release();
    assert.equal(f.backup().value, expires ? f.nil : f.original.handle);
    assert.equal(f.mock.refs, 1);
    restore();
    assert.equal(f.slot.value, expires ? f.nil : f.original.handle);
    assert.equal(f.registered(), 1, 'temporary weak registration is destroyed');
    assert.equal(f.mock.refs, 0);
    assert.equal(f.target.refs, 1);
  });
}

test('iOS object fields allow null and reject unknown ownership or automatic JS wrapping', async () => {
  const f = await fixture(1);
  const restore = f.install(null);
  assert.equal(f.slot.value, f.nil);
  restore();
  assert.equal(f.slot.value, f.original.handle);
  for (const ownership of [0, 3]) {
    const bad = await fixture(ownership);
    assert.throws(() => bad.install(bad.mock), /ownership is unsupported/);
    assert.equal(bad.target.refs, 1);
    assert.equal(bad.mock.refs, 1);
  }
  for (const value of ['JP', {}, () => null]) assert.throws(() => f.install(value), /object or null/);
  assert.equal(f.target.refs, 1);
});
