import ObjC from 'frida-objc-bridge';
import { errorMessage, safeConsole, safeEmit } from '../common/reporting.js';
import { requireObjCRuntime } from '../common/main-thread.js';
import { installField } from './fields.js';

function requireMethodName(selector) {
  if (typeof selector !== 'string' || !/^[-+] \S/.test(selector)) {
    throw new Error("Override selector must start with '- ' or '+ '");
  }
  return selector;
}

function reportCallbackError(phase, className, selector, error) {
  safeEmit('override.callback_error', {
    phase,
    className,
    selector,
    message: errorMessage(error),
  });
}

function nativeReturnValue(value) {
  // NativeCallback integer return types do not consistently coerce JavaScript
  // booleans on all Frida/iOS combinations. BOOL is ABI-compatible with 0/1.
  return typeof value === 'boolean' ? Number(value) : value;
}

function installDefinition(definition) {
  requireObjCRuntime();
  if (definition && Object.hasOwn(definition, 'field')) return installField(definition);
  const target = definition?.target;
  const className = typeof target === 'string' ? target : target?.$className;
  const targetClass = typeof target === 'string' ? ObjC.classes[target] : target;
  if (!targetClass || !className) {
    throw new Error(`Objective-C class not found: ${String(target)}`);
  }
  const selector = requireMethodName(definition.selector);
  const method = targetClass[selector];
  if (!method?.implementation) {
    throw new Error(`Objective-C method not found: ${className} ${selector}`);
  }
  if (!Object.hasOwn(definition, 'withReturn')) {
    throw new Error(`Override withReturn is required: ${className} ${selector}`);
  }
  if (definition.filter !== undefined && typeof definition.filter !== 'function') {
    throw new Error(`Override filter must be a function: ${className} ${selector}`);
  }

  const originalImplementation = method.implementation;
  const replacement = ObjC.implement(method, (handle, command, ...rawArgs) => {
    let receiver;
    try {
      receiver = new ObjC.Object(handle);
    } catch (error) {
      reportCallbackError('invocation', className, selector, error);
      return originalImplementation(handle, command, ...rawArgs);
    }
    const invocation = {
      receiver,
      args: rawArgs,
      className: receiver?.$className ?? className,
      selector,
    };
    if (definition.filter) {
      let matched;
      try {
        matched = definition.filter(invocation) === true;
      } catch (error) {
        reportCallbackError('filter', className, selector, error);
        return originalImplementation(handle, command, ...rawArgs);
      }
      if (!matched) return originalImplementation(handle, command, ...rawArgs);
    }
    if (typeof definition.withReturn !== 'function') {
      return nativeReturnValue(definition.withReturn);
    }
    try {
      return nativeReturnValue(definition.withReturn(invocation));
    } catch (error) {
      reportCallbackError('withReturn', className, selector, error);
      return originalImplementation(handle, command, ...rawArgs);
    }
  });
  method.implementation = replacement;

  let uninstalled = false;
  return () => {
    if (uninstalled) return;
    uninstalled = true;
    method.implementation = originalImplementation;
  };
}

function uninstallDefinitions(uninstallers) {
  for (const uninstall of [...uninstallers].reverse()) {
    try {
      uninstall();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] iOS override cleanup failed', {
        message: errorMessage(error),
      });
    }
  }
}

function run(definitions, action) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error('Override.run definitions must be a non-empty array');
  }
  if (typeof action !== 'function') {
    throw new Error('Override.run action must be a function');
  }
  const uninstallers = [];
  try {
    for (const definition of definitions) {
      uninstallers.push(installDefinition(definition));
    }
  } catch (error) {
    uninstallDefinitions(uninstallers);
    throw error;
  }

  const cleanup = () => uninstallDefinitions(uninstallers);
  let result;
  try {
    result = action();
  } catch (error) {
    cleanup();
    throw error;
  }
  if (result instanceof Promise) return result.finally(cleanup);
  cleanup();
  return result;
}

const Override = Object.freeze({ run });

export { Override };
