import ObjC from 'frida-objc-bridge';
import {
  errorMessage,
  safeConsole,
  safeEmit,
  writeEvidence,
} from '../../common/reporting.js';
import { requireObjCRuntime } from '../../common/main-thread.js';
import { installNSLogEvidenceReplacement } from './native-log.js';
import { runEvidenceAction } from './utils.js';

function requireMethodName(selector) {
  if (typeof selector !== 'string' || !/^[-+] \S/.test(selector)) {
    throw new Error("Hook selector must start with '- ' or '+ '");
  }
  return selector;
}

function installMethodHook(definition, actionDescription) {
  requireObjCRuntime();
  if (typeof Interceptor === 'undefined' || typeof Interceptor.attach !== 'function') {
    throw new Error('Interceptor is unavailable in the current iOS process');
  }
  const target = definition?.target;
  const className = typeof target === 'string' ? target : target?.$className;
  const targetClass = typeof target === 'string' ? ObjC.classes[target] : target;
  if (!targetClass || !className) {
    throw new Error(`Objective-C class not found: ${String(target)}`);
  }
  const methodName = requireMethodName(definition.selector);
  const method = targetClass[methodName];
  if (!method?.implementation) {
    throw new Error(`Objective-C method not found: ${className} ${methodName}`);
  }
  const filter = definition.filter;
  if (filter !== undefined && typeof filter !== 'function') {
    throw new Error('Hook filter must be a function');
  }

  const listener = Interceptor.attach(method.implementation, {
    onEnter(args) {
      this.mobileEasyUseMatched = true;
      let receiver = null;
      try {
        receiver = new ObjC.Object(args[0]);
        if (methodName.startsWith('- ')
          && typeof receiver.isKindOfClass_ === 'function'
          && !Boolean(receiver.isKindOfClass_(targetClass))) {
          this.mobileEasyUseMatched = false;
          return;
        }
        if (filter && filter({ receiver, className, selector: methodName }) !== true) {
          this.mobileEasyUseMatched = false;
          return;
        }
      } catch (error) {
        this.mobileEasyUseMatched = false;
        safeEmit('probe.callback_error', {
          phase: 'filter',
          className,
          selector: methodName,
          message: errorMessage(error),
        });
        return;
      }
      writeEvidence('chain', {
        type: 'method',
        actionDescription,
        className: receiver?.$className ?? className,
        selector: methodName,
        phase: 'enter',
      });
    },
    onLeave() {
      if (this.mobileEasyUseMatched !== true) return;
      writeEvidence('chain', {
        type: 'method',
        actionDescription,
        className,
        selector: methodName,
        phase: 'leave',
      });
    },
  });
  return () => listener.detach();
}

function uninstallHooks(uninstallers) {
  for (const uninstall of [...uninstallers].reverse()) {
    try {
      uninstall();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] iOS hook cleanup failed', {
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
    if (logTag.length === 0) {
      throw new Error('withChainEvidence logTag must not be empty');
    }
    return new Set([logTag]);
  }
  if (logTag instanceof Set) {
    const tags = new Set([...logTag].map(String));
    if ([...tags].some((tag) => tag.length === 0)) {
      throw new Error('withChainEvidence logTag must not contain an empty TAG');
    }
    return tags;
  }
  throw new Error('withChainEvidence logTag must be a string, Set<string>, or undefined');
}

async function withChainEvidence(action, actionDescription, logTag, methodHooks = []) {
  if (typeof action !== 'function') {
    throw new Error('withChainEvidence action must be a function');
  }
  if (!Array.isArray(methodHooks)) {
    throw new Error('withChainEvidence methodHooks must be an array');
  }
  const uninstallers = [];
  try {
    const logTags = normalizeLogTags(logTag);
    if (logTags && logTags.size > 0) {
      uninstallers.push(installNSLogEvidenceReplacement(logTags, actionDescription));
    }
    for (const definition of methodHooks) {
      uninstallers.push(installMethodHook(definition, actionDescription));
    }
  } catch (error) {
    uninstallHooks(uninstallers);
    throw error;
  }
  return runEvidenceAction(action, () => uninstallHooks(uninstallers));
}

export { withChainEvidence };
