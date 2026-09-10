import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function fixture({ arch = 'arm64', apiLevel = 31, available = true, initError } = {}) {
  const calls = [];
  const holder = { $className: 'Example', class: { getClassLoader: () => 'loader' } };
  const api = {
    find(symbol) { calls.push(['resolve', symbol]); return available ? 'function' : null; },
    artClassLinker: { address: 'linker' },
  };
  const Java = {
    use(name) {
      assert.equal(name, 'java.lang.Class');
      return { forName(...args) { calls.push(['initialize', ...args]); if (initError) throw initError; } };
    },
    vm: { getEnv: () => 'env' },
  };
  const context = vm.createContext({ console: { warn: message => calls.push(['warn', message]) }, Process: { arch }, NativeFunction: function (address, result, args) {
    assert.equal(address, 'function');
    assert.equal(result, 'void');
    assert.deepEqual(Array.from(args), ['pointer', 'pointer', 'bool']);
    return (...values) => calls.push(['complete', ...values]);
  } });
  const entry = new vm.SourceTextModule(await readFile(new URL('../sdk/android/common/static-hook.js', import.meta.url), 'utf8'), { context });
  await entry.link(specifier => {
    const exports = specifier === 'frida-java-bridge' ? { default: Java } : {
      getAndroidApiLevel: () => apiLevel, getApi: () => api,
      getArtThreadFromEnv(env) { assert.equal(env, 'env'); return 'thread'; },
    };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await entry.evaluate();
  return { calls, prepare: (type = 2) => entry.namespace.prepareStaticHook({ type, holder }) };
}

test('static preparation completes initialization each installation and caches only symbol lookup', async () => {
  const f = await fixture();
  f.prepare(); f.prepare();
  assert.deepEqual(f.calls.map(call => call[0]), ['resolve', 'initialize', 'complete', 'initialize', 'complete']);
  assert.deepEqual(f.calls[1], ['initialize', 'Example', true, 'loader']);
  assert.deepEqual(f.calls[2], ['complete', 'linker', 'thread', 1]);
});

test('instance methods and platforms without deferred ARM initialization are untouched', async () => {
  for (const options of [{ arch: 'x64' }, { apiLevel: 29 }]) {
    const f = await fixture(options); f.prepare(); assert.deepEqual(f.calls, []);
  }
  const f = await fixture(); f.prepare(3); assert.deepEqual(f.calls, []);
});

test('unavailable ART support warns and allows Hook installation to continue', async () => {
  const unavailable = await fixture({ available: false });
  assert.doesNotThrow(() => unavailable.prepare());
  assert.deepEqual(unavailable.calls.map(call => call[0]), ['resolve', 'warn']);
  assert.match(unavailable.calls[1][1], /continuing without static Hook preparation/);
});

test('failed class initialization still aborts preparation', async () => {
  const error = Error('class initializer failed');
  const failed = await fixture({ initError: error });
  assert.throws(() => failed.prepare(), value => value === error);
  assert.deepEqual(failed.calls.map(call => call[0]), ['resolve', 'initialize']);
});
