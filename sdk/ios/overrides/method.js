import ObjC from 'frida-objc-bridge';
import { IOSRuntime } from '../runtime.js';
import { requireObjCRuntime } from '../common/main-thread.js';
import { safeEmit, errorMessage } from '../common/reporting.js';

export function method(definition, returnInstead) {
  requireObjCRuntime();
  if (arguments.length < 2) throw new TypeError('returnInstead is required');
  const { className, selector, filter } = definition ?? {};
  if (typeof selector !== 'string' || !/^[-+] \S/.test(selector)) throw new TypeError('Expected a selector with - or + prefix');
  if (typeof className !== 'string' || !className.trim()) throw new TypeError('className must be a non-empty string');
  if (filter !== undefined) requireSynchronous(filter);
  if (typeof returnInstead === 'function') requireSynchronous(returnInstead);
  const owner = IOSRuntime.findClass(className, [selector]);
  const selected = owner?.[selector];
  if (!selected?.implementation) throw new Error(`Objective-C method not found: ${selector}`);
  const original = selected.implementation;
  let retainedReturn = false;
  let replacement;
  try {
    if (returnInstead instanceof ObjC.Object) { returnInstead.retain(); retainedReturn = true; }
    replacement = ObjC.implement(selected, (receiver, command, ...args) => {
      let phase = 'filter';
      try {
        if (!filter || filter(...args) === true) {
          phase = 'returnInstead';
          return typeof returnInstead === 'function' ? returnInstead(...args) : returnInstead;
        }
      } catch (error) {
        safeEmit('override.callback_error', { className, selector, phase, message: errorMessage(error) });
      }
      return original(receiver, command, ...args);
    });
    selected.implementation = replacement;
  } catch (error) {
    if (retainedReturn) returnInstead.release();
    throw error;
  }
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    selected.implementation = original;
    if (retainedReturn) returnInstead.release();
  };
}

function requireSynchronous(fn) {
  if (typeof fn !== 'function' || Object.prototype.toString.call(fn) !== '[object Function]') {
    throw new TypeError('Expected a synchronous callback');
  }
}
