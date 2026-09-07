import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

for (const platform of ['android', 'ios']) {
  test(`${platform}: thread names follow emitting thread, native fallback, unnamed and failed reads`, async () => {
    let name = 'worker-one', attached = true, status = 0;
    let nativeName = 'native-worker', nativeReads = 0;
    const bridge = platform === 'android' ? {
      vm: {tryGetEnv: () => attached ? {} : null},
      use: () => ({currentThread: () => ({getName: () => name})}),
    } : {classes: {NSThread: {currentThread: () => ({name: () => name})}}};
    const native = {pthread_self: () => 'current-native-thread', pthread_getname_np(thread, buffer, size) {
      nativeReads++; assert.equal(thread, 'current-native-thread'); assert.equal(size, 64);
      buffer.value = nativeName; return status;
    }};
    const context = vm.createContext({Module: {getGlobalExportByName: name => native[name]},
      NativeFunction: function (fn) { return fn; },
      Memory: {alloc: () => ({readUtf8String() {return this.value;}})}});
    const entry = new vm.SourceTextModule(await readFile(new URL(`../sdk/${platform}/common/thread.js`, import.meta.url), 'utf8'), {context});
    await entry.link(() => new vm.SyntheticModule(['default'], function () {this.setExport('default', bridge);}, {context}));
    await entry.evaluate();
    const get = entry.namespace.currentThreadName;
    assert.equal(get(), 'worker-one'); name = 'worker-two'; assert.equal(get(), 'worker-two');
    assert.equal(nativeReads, 0, 'no native fallback when platform name is available');
    name = null; attached = false; assert.equal(get(), 'native-worker');
    nativeName = ''; assert.equal(get(), null);
    status = 1; nativeName = 'must-not-be-used'; assert.equal(get(), null);
  });
}
