import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function fixture() {
  const state = { signature: 'Ljava/lang/Object;', text: '', null: false, slot: 1, calls: [] };
  const handle = { isNull: () => state.null };
  const wrapper = { $h: handle, $dispose() {} };
  const env = {};
  const Java = { vm: { getEnv: () => env } };
  // Stub the converter boundary, not Frida's implementation; real conversion is tested on device.
  const factory = { _getType(name) {
    state.typeName = name;
    return {
      className: name,
      fromJni(raw, actualEnv) {
        assert.equal(raw, handle);
        assert.equal(actualEnv, env);
        if (state.null) return null;
        return state.converted ?? (name === 'java.lang.String' ? state.text : wrapper);
      },
      isCompatible: value => value === null || !!value?.$h ||
        (typeof value === 'string' && ['java.lang.String', 'java.lang.Object'].includes(name)),
      toJni(value, actualEnv) {
        assert.equal(actualEnv, env);
        return value === null ? {isNull: () => true} : value.$h ?? {text: value};
      },
    };
  } };
  const context = vm.createContext({
    Process: { pointerSize: 8 },
    Memory: { alloc: () => ({ readS32: () => state.slot, readPointer() { return this.pointer; },
      writePointer(pointer) { this.pointer = pointer; } }), allocUtf8String: text => text },
    Int64: class {},
  });
  const module = new vm.SourceTextModule(await readFile(new URL('../sdk/android/common/debugger/native.js', import.meta.url), 'utf8'), { context });
  await module.link(() => new vm.SyntheticModule(['default'], function () { this.setExport('default', Java); }, { context }));
  await module.evaluate();
  const api = {
    resolve(_, name, slot, type, field) {
      field.pointer = { isNull: () => true };
      type.pointer = { isNull: () => false, readUtf8String: () => state.signature };
      return 0;
    },
    localRead(_, slot, kind, buffer) { state.calls.push('localRead'); buffer.pointer = handle; return 0; },
    fieldRead(_, field, kind, buffer) { state.calls.push('fieldRead'); buffer.pointer = handle; return 0; },
    receiver(_, buffer) { state.calls.push('receiver'); buffer.pointer = handle; return 0; },
    localWrite() { state.calls.push('localWrite'); return 0; },
    fieldWrite() { state.calls.push('fieldWrite'); return 0; },
    free() {},
  };
  return { state, wrapper, read() {
    const wrappers = [];
    const value = module.namespace.readVariable(api, {}, 'value', factory, wrappers);
    return { value, wrappers };
  }, write(value) {
    module.namespace.writeVariable(api, {}, 'value', value, factory);
  }, encode: (value, signature) => module.namespace.encode(value, signature, factory).readPointer() };
}

test('declared types select Frida converters for reads and writes', async () => {
  const f = await fixture();
  for (const name of ['String', 'Object', 'CharSequence']) {
    f.state.signature = `Ljava/lang/${name};`;
    f.state.text = '中文😀';
    const result = f.read();
    assert.equal(f.state.typeName, `java.lang.${name}`);
    assert.equal(result.value, name === 'String' ? f.state.text : f.wrapper);
    assert.equal(result.wrappers.length, name === 'String' ? 0 : 1);
    if (name === 'CharSequence') assert.throws(() => f.encode('hello', f.state.signature), /incompatible/);
    else assert.equal(f.encode('hello', f.state.signature).text, 'hello');
  }
  f.state.null = true;
  assert.equal(f.read().value, null);
  assert.equal(f.encode(null, 'Ljava/lang/Object;').isNull(), true);
});

test('cleanup captures original nested array wrappers before user mutation', async () => {
  const f = await fixture();
  const innerWrapper = {$dispose() {}}, outerWrapper = {$dispose() {}}, external = {$dispose() {}};
  const inner = Object.assign([f.wrapper, null], {$w: innerWrapper});
  f.state.converted = Object.assign([inner, null], {$w: outerWrapper});
  f.state.signature = '[[Ljava/lang/Object;';
  const {value, wrappers} = f.read();
  assert.equal(f.state.typeName, '[[Ljava.lang.Object;');
  inner[0] = external;
  value[0] = null;
  assert.deepEqual(wrappers, [f.wrapper, innerWrapper, outerWrapper]);
});

test('object wrappers are tracked; unsupported descriptors fail', async () => {
  const f = await fixture();
  assert.equal(f.read().value, f.wrapper);
  assert.deepEqual(f.read().wrappers, [f.wrapper]);
  f.state.signature = 'Q';
  assert.throws(() => f.read(), /Unsupported JVM type/);
});

test('slot tags dispatch to separate local, field and receiver entry points', async () => {
  const f = await fixture();
  for (const [slot, read, write] of [[1, 'localRead', 'localWrite'], [-2, 'fieldRead', 'fieldWrite']]) {
    f.state.slot = slot; f.state.calls = [];
    f.read(); f.write(null);
    assert.deepEqual(f.state.calls, [read, write]);
  }
  f.state.slot = -1; f.state.calls = [];
  f.read();
  assert.throws(() => f.write(null), /Cannot replace this/);
  assert.deepEqual(f.state.calls, ['receiver']);
});
