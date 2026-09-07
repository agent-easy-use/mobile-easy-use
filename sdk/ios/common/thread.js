import ObjC from 'frida-objc-bridge';

/** Called on the emitting thread; an unnamed thread is represented by null. */
export function currentThreadName() {
  try {
    const name = ObjC.classes.NSThread.currentThread().name();
    if (name !== null && String(name)) return String(name);
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
