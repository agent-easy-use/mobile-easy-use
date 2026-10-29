import Java from 'frida-java-bridge';
import { prepareStaticHook } from '../common/static-hook.js';
import { safeEmit, errorMessage } from '../common/reporting.js';

export function method(definition, returnInstead) {
  if (arguments.length < 2) throw new TypeError('returnInstead is required');
  const { className, filter } = definition ?? {};
  if (typeof className !== 'string' || !className.trim()) throw new TypeError('className must be a non-empty string');
  if (filter !== undefined) requireSynchronous(filter);
  if (typeof returnInstead === 'function') requireSynchronous(returnInstead);
  let remove;
  Java.performNow(() => {
    const selected = resolveMethod(Java.use(className), definition);
    if (selected.implementation != null) throw new Error('Method already has an implementation');
    let savedReturn;
    let replacement;
    try {
      if (returnInstead?.$h) savedReturn = Java.retain(returnInstead);
      prepareStaticHook(selected);
      replacement = function (...args) {
        let phase = 'filter';
        try {
          if (!filter || filter(...args) === true) {
            phase = 'returnInstead';
            return typeof returnInstead === 'function' ? returnInstead(...args) : savedReturn ?? returnInstead;
          }
        } catch (error) {
          safeEmit('override.callback_error', { className, method: definition.method, phase, message: errorMessage(error) });
        }
        return selected.call(this, ...args);
      };
      selected.implementation = replacement;
      // Frida exposes its NativeCallback wrapper, not the JS function assigned above.
      replacement = selected.implementation;
    } catch (error) {
      savedReturn?.$dispose();
      throw error;
    }
    let removed = false;
    remove = () => {
      if (removed) return;
      removed = true;
      Java.performNow(() => {
        if (selected.implementation !== replacement) throw new Error('Method implementation changed after override installation');
        selected.implementation = null;
        savedReturn?.$dispose();
      });
    };
  });
  return remove;
}

function resolveMethod(owner, definition) {
  const { method, argumentTypes } = definition;
  if (typeof method !== 'string' || !method || ['$new', '$init', '<init>', '<clinit>'].includes(method)) {
    throw new TypeError('Expected a method name; constructors are unsupported');
  }
  if (argumentTypes !== undefined && (!Array.isArray(argumentTypes) || argumentTypes.some(t => typeof t !== 'string'))) {
    throw new TypeError('argumentTypes must be an array of type names');
  }
  const wrapper = owner[method];
  if (!Array.isArray(wrapper?.overloads)) throw new Error(`Java method not found: ${method}`);
  if (argumentTypes === undefined && wrapper.overloads.length !== 1) throw new Error('Specify argumentTypes for an overloaded method');
  return argumentTypes === undefined ? wrapper.overloads[0] : wrapper.overload(...argumentTypes);
}

function requireSynchronous(fn) {
  if (typeof fn !== 'function' || Object.prototype.toString.call(fn) !== '[object Function]') {
    throw new TypeError('Expected a synchronous callback');
  }
}
