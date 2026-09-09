import Java from 'frida-java-bridge';
import { errorMessage, safeConsole, safeEmit } from '../common/reporting.js';
import { installField } from './fields.js';

function methodName(targetClass, method, overload) {
  const className = targetClass?.$className;
  const argumentTypes = (overload.argumentTypes ?? [])
    .map((type) => type.className ?? type.name)
    .join(', ');
  return `${className}.${method}(${argumentTypes})`;
}

function reportCallbackError(phase, name, error) {
  safeEmit('override.callback_error', {
    phase,
    method: name,
    message: errorMessage(error),
  });
}

function installDefinition(definition) {
  let uninstall;
  Java.performNow(() => {
    const target = definition?.target;
    const method = definition?.method;
    const targetClass = typeof target === 'string' ? Java.use(target) : target;
    if (definition && Object.hasOwn(definition, 'field')) {
      uninstall = installField(definition, targetClass);
      return;
    }
    const methodWrapper = targetClass?.[method];
    if (!targetClass?.$className || typeof method !== 'string' || method.length === 0
      || !methodWrapper || !Array.isArray(methodWrapper.overloads)) {
      throw new Error(`Java method not found: ${targetClass?.$className ?? String(target)}.${String(method)}`);
    }
    if (!Object.hasOwn(definition, 'withReturn')) {
      throw new Error(`Override withReturn is required: ${targetClass.$className}.${method}`);
    }
    if (definition.filter !== undefined && typeof definition.filter !== 'function') {
      throw new Error(`Override filter must be a function: ${targetClass.$className}.${method}`);
    }
    const requestedSignature = definition.argumentTypes ?? null;
    if (requestedSignature !== null && !Array.isArray(requestedSignature)) {
      throw new Error(`Override argumentTypes must be an array: ${targetClass.$className}.${method}`);
    }
    if (requestedSignature && definition.allOverloads === true) {
      throw new Error('Override cannot use argumentTypes and allOverloads together');
    }
    if (!requestedSignature && definition.allOverloads !== true && methodWrapper.overloads.length !== 1) {
      throw new Error(
        `Java method has ${methodWrapper.overloads.length} overloads; specify argumentTypes or allOverloads: true: ${targetClass.$className}.${method}`,
      );
    }
    const selected = requestedSignature
      ? [methodWrapper.overload(...requestedSignature)]
      : definition.allOverloads === true
        ? [...methodWrapper.overloads]
        : [methodWrapper.overloads[0]];
    if (selected.some((overload) => !overload)) {
      throw new Error(`Java overload not found: ${targetClass.$className}.${method}`);
    }

    const installed = [];
    try {
      for (const overload of selected) {
        if (overload.implementation !== null && overload.implementation !== undefined) {
          throw new Error(`Java overload already has an implementation: ${methodName(targetClass, method, overload)}`);
        }
        const original = overload;
        const name = methodName(targetClass, method, overload);
        overload.implementation = function (...rawArgs) {
          const invocation = {
            receiver: this,
            args: rawArgs,
            argumentTypes: (original.argumentTypes ?? [])
              .map((type) => type.className ?? type.name),
          };
          if (definition.filter) {
            let matched;
            try {
              matched = definition.filter(invocation) === true;
            } catch (error) {
              reportCallbackError('filter', name, error);
              return original.call(this, ...rawArgs);
            }
            if (!matched) return original.call(this, ...rawArgs);
          }
          if (typeof definition.withReturn !== 'function') {
            return definition.withReturn;
          }
          try {
            return definition.withReturn(invocation);
          } catch (error) {
            reportCallbackError('withReturn', name, error);
            return original.call(this, ...rawArgs);
          }
        };
        installed.push(overload);
      }
    } catch (error) {
      for (const overload of installed.reverse()) {
        overload.implementation = null;
      }
      throw error;
    }

    let uninstalled = false;
    uninstall = () => {
      if (uninstalled) return;
      uninstalled = true;
      for (const overload of installed) {
        overload.implementation = null;
      }
    };
  });
  return uninstall;
}

function uninstallDefinitions(uninstallers) {
  for (const uninstall of [...uninstallers].reverse()) {
    try {
      uninstall();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] Android override cleanup failed', {
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
