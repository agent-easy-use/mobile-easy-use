import Java from 'frida-java-bridge';

/** Called on the emitting thread; never schedule a name lookup onto another thread. */
export function currentThreadName() {
  try {
    if (Java.vm.tryGetEnv() !== null) {
      const name = Java.use('java.lang.Thread').currentThread().getName();
      if (name !== null) return String(name) || null;
    }
  } catch (_) {}
  return nativeThreadName();
}

let pthreadSelf;
let pthreadGetName;
function nativeThreadName() {
  try {
    pthreadSelf ??= new NativeFunction(Module.getGlobalExportByName('pthread_self'), 'pointer', []);
    pthreadGetName ??= new NativeFunction(Module.getGlobalExportByName('pthread_getname_np'), 'int', ['pointer', 'pointer', 'ulong']);
    const buffer = Memory.alloc(64);
    if (pthreadGetName(pthreadSelf(), buffer, 64) !== 0) return null;
    return buffer.readUtf8String() || null;
  } catch (_) {
    return null;
  }
}
