import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function fixture(attributes = {}) {
  const state = { value: null, writes: [], freed: 0, fail: false, found: true };
  class ObjectWrapper {
    constructor(id) { this.refs = 1; this.handle = id; this.$kind = 'instance'; }
    retain() { assert.ok(this.refs > 0); this.refs++; }
    release() { assert.ok(this.refs > 0); this.refs--; }
  }
  const original = new ObjectWrapper('original');
  state.value = original;
  const instance = new ObjectWrapper('instance');
  instance.$class = { handle: 'class' };
  const getter = `- ${attributes.G ?? 'title'}`;
  const setter = `- ${attributes.S ?? 'setTitle:'}`;
  instance[getter] = () => {
    if (state.getterFails) throw Error('getter failed');
    return state.value;
  };
  instance[setter] = value => {
    state.writes.push(value);
    if (state.fail) throw Error('setter failed');
    // Mock a strong setter's ownership, independently of SDK holds.
    if (!state.weak) {
      if (value instanceof ObjectWrapper) value.retain();
      if (state.value instanceof ObjectWrapper) state.value.release();
    }
    state.value = value;
  };
  const functions = {
    class_getProperty(cls, name) {
      assert.equal(cls, 'class');
      assert.equal(name, 'title');
      return { isNull: () => !state.found };
    },
    property_copyAttributeValue(_property, key) {
      return { isNull: () => !(key in attributes), readCString: () => attributes[key] };
    },
    free() { state.freed++; },
  };
  const context = vm.createContext({
    Memory: { allocUtf8String: x => x },
    Module: { getGlobalExportByName: name => {
      assert.ok(functions[name], `Unexpected runtime call: ${name}`);
      return functions[name];
    } },
    NativeFunction: function (fn) { return fn; },
  });
  const entry = new vm.SourceTextModule(await readFile(new URL('../sdk/ios/overrides/field.js', import.meta.url), 'utf8'), { context });
  await entry.link(name => {
    const values = name.includes('main-thread') ? { requireObjCRuntime() {} } : { default: { Object: ObjectWrapper } };
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await entry.evaluate();
  return { state, original, instance, getter, setter, ObjectWrapper,
    install: value => entry.namespace.field({ instance, property: 'title' }, value) };
}

for (const value of ['hello', true, 42, null]) {
  test(`iOS property passes ${String(value)} unchanged to Frida and restores through setter`, async () => {
    const f = await fixture();
    const remove = f.install(value);
    assert.equal(f.state.writes[0], value);
    assert.equal(f.original.refs, 1, 'saved old object survives the strong setter');
    assert.equal(f.instance.refs, 2);
    assert.throws(() => f.install(value), /already/);
    remove();
    remove();
    assert.deepEqual(f.state.writes, [value, f.original]);
    assert.equal(f.original.refs, 1);
    assert.equal(f.instance.refs, 1);
  });
}

test('iOS property resolves custom accessors and frees metadata copies', async () => {
  const f = await fixture({ G: 'displayTitle', S: 'updateTitle:' });
  const remove = f.install('custom');
  assert.equal(f.state.value, 'custom');
  assert.equal(f.state.freed, 2);
  remove();
  assert.equal(f.state.value, f.original);
});

test('iOS property retains old weak value until removal, without retaining replacement', async () => {
  const f = await fixture();
  f.state.weak = true;
  const replacement = new f.ObjectWrapper('replacement');
  const remove = f.install(replacement);
  assert.equal(f.original.refs, 2);
  assert.equal(replacement.refs, 1);
  f.original.release();
  assert.equal(f.original.refs, 1, 'SDK extends the old weak value lifetime');
  remove();
  assert.equal(f.original.refs, 0, 'SDK relinquishes its hold after invoking the weak setter');
  assert.equal(replacement.refs, 1);
  assert.equal(f.instance.refs, 1);
});

test('iOS property rejects readonly, missing metadata and missing accessors before mutation', async () => {
  const readonly = await fixture({ R: '' });
  assert.throws(() => readonly.install('x'), /readonly/);
  assert.equal(readonly.state.freed, 1);
  const missing = await fixture();
  missing.state.found = false;
  assert.throws(() => missing.install('x'), /property not found/);
  const accessor = await fixture();
  delete accessor.instance[accessor.setter];
  assert.throws(() => accessor.install('x'), /accessors not found/);
  for (const f of [readonly, missing, accessor]) {
    assert.deepEqual(f.state.writes, []);
    assert.equal(f.instance.refs, 1);
  }
});

for (const phase of ['getter', 'install', 'remove']) {
  test(`iOS property releases SDK holds and conflict after ${phase} failure`, async () => {
    const f = await fixture();
    if (phase === 'remove') {
      const remove = f.install('x');
      f.state.fail = true;
      assert.throws(remove, /setter failed/);
      assert.equal(f.original.refs, 0);
      remove();
      assert.equal(f.state.writes.length, 2);
    } else {
      f.state.getterFails = phase === 'getter';
      f.state.fail = phase === 'install';
      assert.throws(() => f.install('x'), /failed/);
      assert.equal(f.original.refs, 1);
    }
    assert.equal(f.instance.refs, 1);
    f.state.fail = false;
    f.state.getterFails = false;
    const next = f.install('next');
    next();
    assert.equal(f.instance.refs, 1);
  });
}
