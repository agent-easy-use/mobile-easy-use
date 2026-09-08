import { currentThreadName } from '../../common/thread.js';
import { createCapture } from './capture.js';
import { errorMessage, safeConsole, safeEmit } from '../../common/reporting.js';
import Java from 'frida-java-bridge';
import { installNativeLogEvidenceHooks } from './native-log.js';
import { runEvidenceAction, writeEvidence } from './utils.js';

function installHook(targetClass, methodName, options = {}) {
  let uninstall;
  Java.performNow(() => {
    const javaClass = typeof targetClass === 'string' ? Java.use(targetClass) : targetClass;
    const method = javaClass?.[methodName];
    if (!method || !Array.isArray(method.overloads)) {
      throw new Error(`Java method not found: ${javaClass?.$className ?? targetClass}.${methodName}`);
    }
    const requestedSignature = options.argumentTypes ?? null;
    if (requestedSignature && options.allOverloads === true) {
      throw new Error('Hook cannot use argumentTypes and allOverloads together');
    }
    if (!requestedSignature && options.allOverloads !== true && method.overloads.length !== 1) {
      throw new Error(
        `Java method has ${method.overloads.length} overloads; specify argumentTypes or allOverloads: true: ${javaClass.$className}.${methodName}`,
      );
    }
    const selected = requestedSignature
      ? [method.overload(...requestedSignature)]
      : options.allOverloads === true
        ? [...method.overloads]
        : [method.overloads[0]];
    if (selected.some((overload) => !overload)) {
      throw new Error(`Java overload not found: ${javaClass.$className}.${methodName}`);
    }
    const mode = options.mode ?? 'observe';
    if (mode !== 'observe' && mode !== 'mutate') {
      throw new Error(`Unsupported hook mode: ${mode}`);
    }
    const capture = createCapture(options.capture);
    const installed = [];
    const runCallback = (phase, callback, input) => {
      if (typeof callback !== 'function') {
        return undefined;
      }
      try {
        return callback(input);
      } catch (error) {
        safeEmit('probe.callback_error', { phase, message: errorMessage(error) });
        return undefined;
      }
    };
    try {
      for (const overload of selected) {
        if (overload.implementation !== null && overload.implementation !== undefined) {
          throw new Error(`Java overload already has an implementation: ${javaClass.$className}.${methodName}`);
        }
        const original = overload;
        overload.implementation = function (...rawArgs) {
          const invocation = {
            receiver: this,
            args: rawArgs,
            argumentTypes: (original.argumentTypes ?? []).map((type) => type.className ?? type.name),
          };
          if (typeof options.filter === 'function'
            && runCallback('filter', options.filter, invocation) !== true) {
            return original.call(this, ...rawArgs);
          }
          const emitEnter = evidenceCapture => runCallback('onEnter', options.onEnter, { ...invocation, evidenceCapture });
          const captured = capture ? capture.begin(() => invocation, emitEnter) : undefined;
          if (!capture) emitEnter(undefined);
          let result;
          try {
            result = original.call(this, ...rawArgs);
          } catch (error) {
            capture?.end(captured);
            const evidenceCapture = capture?.finish(captured, () => invocation, false);
            runCallback('onError', options.onError, { ...invocation, error, evidenceCapture });
            throw error;
          }
          capture?.end(captured);
          const evidenceCapture = capture?.finish(captured, () => ({ ...invocation, result }), true);
          const replacement = runCallback('onLeave', options.onLeave, {
            ...invocation,
            result,
            evidenceCapture,
          });
          if (mode === 'mutate' && replacement !== undefined) {
            result = replacement;
          }
          return result;
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
      if (uninstalled) {
        return;
      }
      uninstalled = true;
      for (const overload of installed) {
        overload.implementation = null;
      }
    };
  });
  return uninstall;
}

function uninstallEvidenceHooks(uninstallHooks) {
  for (const uninstall of [...uninstallHooks].reverse()) {
    try {
      uninstall();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] evidence hook cleanup failed', {
        message: errorMessage(error),
      });
    }
  }
}

function normalizeLogTags(logTag) {
  if (logTag === undefined) {
    return null;
  }
  if (typeof logTag === 'string') {
    return new Set([logTag]);
  }
  if (logTag instanceof Set) {
    return new Set([...logTag].map(String));
  }
  throw new Error('logTag must be a string, Set<string>, or undefined');
}

async function withChainEvidence(action, actionDescription, logTag, methodHooks = []) {
  if (typeof action !== 'function') {
    throw new Error('withChainEvidence action must be a function');
  }
  if (!Array.isArray(methodHooks)) {
    throw new Error('withChainEvidence methodHooks must be an array');
  }
  const uninstallHooks = [];
  try {
    const logTags = normalizeLogTags(logTag);
    if (logTags && logTags.size > 0) {
      uninstallHooks.push(installNativeLogEvidenceHooks(logTags, actionDescription));
    }
    for (const definition of methodHooks) {
      const target = definition?.target;
      const methodName = definition?.method;
      if (!target || typeof methodName !== 'string') {
        throw new Error('Each method hook requires target and method');
      }
      const className = typeof target === 'string'
        ? target
        : target?.$className ?? '<unknown>';
      uninstallHooks.push(installHook(target, methodName, {
        argumentTypes: definition.argumentTypes,
        allOverloads: definition.allOverloads,
        mode: 'observe',
        filter: definition.filter,
        capture: definition.capture,
        onEnter(invocation) {
          writeEvidence('chain', {
            threadName: currentThreadName(),
            type: 'method', actionDescription, className, method: methodName, argumentTypes: invocation.argumentTypes, phase: 'enter',
            ...(invocation.evidenceCapture === undefined ? {} : { capture: invocation.evidenceCapture }),
          });
        },
        onLeave(invocation) {
          writeEvidence('chain', {
            threadName: currentThreadName(),
            type: 'method', actionDescription, className, method: methodName, argumentTypes: invocation.argumentTypes, phase: 'leave',
            ...(invocation.evidenceCapture === undefined ? {} : { capture: invocation.evidenceCapture }),
          });
        },
        onError(invocation) {
          writeEvidence('chain', {
            threadName: currentThreadName(),
            type: 'method',
            actionDescription,
            className,
            method: methodName,
            argumentTypes: invocation.argumentTypes,
            phase: 'throw',
            error: errorMessage(invocation.error),
            ...(invocation.evidenceCapture === undefined ? {} : { capture: invocation.evidenceCapture }),
          });
        },
      }));
    }
  } catch (error) {
    uninstallEvidenceHooks(uninstallHooks);
    throw error;
  }
  return runEvidenceAction(action, () => uninstallEvidenceHooks(uninstallHooks));
}

export { withChainEvidence };
