import Java from 'frida-java-bridge';
import { safeEmit } from '../reporting.js';
import { backend, check } from './native.js';

// Own native resources and keep callbacks alive until removal or script unload.
// Callers implement all hit/finish behavior.
const registrations = new Set();
let scriptUnloading = false;

Script.bindWeak(registrations, () => {
  scriptUnloading = true;
  // Async cleanup must finish before Frida releases callback code and the JS runtime.
  Script.pin();
  Promise.allSettled([...registrations].map(registration => registration.remove()))
    .then(results => {
      for (const result of results) {
        if (result.status === 'rejected') console.error('Debugger cleanup failed:', result.reason);
      }
    }).finally(() => Script.unpin());
});
// Track threads separately: the Host must still be able to call stop while another thread handles a hit.
const callbackThreads = new Set();
const isInBreakpointCallback = () => callbackThreads.has(Process.getCurrentThreadId());

// Internal resource entry point; callers supply their own capture/write and record logic.
// Called inside Java.performNow with an already resolved Frida method wrapper.
export function registerBreakpoint(method, fileLine, { onHit, onFinish }) {
  if (scriptUnloading) throw new Error('Debugger runtime is shutting down');
  if (isInBreakpointCallback()) throw new Error('Do not register a debugger from a breakpoint callback');
  const api = backend();
  const wrap = callback => (...args) => {
    const thread = Process.getCurrentThreadId();
    callbackThreads.add(thread);
    try { callback(...args); }
    finally { callbackThreads.delete(thread); }
  };
  const registration = {
    onHit: new NativeCallback(wrap(onHit), 'void', ['pointer']),
    onFinish: new NativeCallback(wrap(onFinish), 'void', ['pointer', 'int']),
    remove,
  };
  const output = Memory.alloc(Process.pointerSize);
  check(api.open(Java.vm.handle, method.handle, Memory.allocUtf8String(method.returnType.name),
    fileLine, registration.onHit, registration.onFinish, output), 'Register debugger');
  const handle = output.readPointer();
  registrations.add(registration);
  let removing;
  function remove() {
    if (isInBreakpointCallback()) throw new Error('Do not stop a debugger from a breakpoint callback');
    if (!removing) removing = Promise.resolve().then(async () => {
      // Clearing the breakpoint prevents new hits, but existing callbacks still own native resources.
      check(api.close(handle), 'Clear breakpoint');
      while (api.active(handle) !== 0) await new Promise(resolve => setTimeout(resolve, 50));
      const skipped = api.reentrant(handle);
      if (skipped) safeEmit('probe.debugger.reentrant', { count: skipped });
      Java.performNow(() => check(api.dispose(handle), 'Dispose debugger'));
      registrations.delete(registration);
    }).catch(error => {
      removing = undefined;
      throw error;
    });
    return removing;
  }
  return remove;
}
