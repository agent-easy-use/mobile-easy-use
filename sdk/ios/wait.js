import { errorMessage } from './common/reporting.js';
import { requireUiPath, stateForUiView } from './ui/index.js';

function waitFailure(code, message, lastCheckError = null) {
  const error = { code, message };
  if (lastCheckError) error.lastCheckError = errorMessage(lastCheckError);
  return { ok: false, error };
}

async function runWait(check, options, requireSynchronousBoolean = false) {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const intervalMs = options?.intervalMs ?? 100;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0
    || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return waitFailure('INVALID_ARGUMENT', 'timeoutMs and intervalMs must be positive finite numbers');
  }
  const deadline = Date.now() + timeoutMs;
  let lastCheckError = null;
  while (true) {
    try {
      const checked = check();
      if (requireSynchronousBoolean && typeof checked !== 'boolean') {
        return waitFailure('INVALID_ARGUMENT', 'Wait predicate must return a synchronous boolean');
      }
      const matched = requireSynchronousBoolean ? checked : await checked;
      if (typeof matched !== 'boolean') {
        return waitFailure('INVALID_ARGUMENT', 'Wait check must return a boolean');
      }
      if (matched) return { ok: true };
    } catch (error) {
      lastCheckError = error;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return waitFailure(
        'TIMEOUT',
        `Wait condition was not met within ${timeoutMs} ms`,
        lastCheckError,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remainingMs)));
  }
}

function normalizeUiTarget(target) {
  if (typeof target === 'string') {
    if (target.length === 0) throw new Error('UI identifier must not be empty');
    return { kind: 'path', value: [`identifier::${target}`] };
  }
  if (Array.isArray(target)) {
    requireUiPath(target);
    return { kind: 'path', value: target };
  }
  throw new Error('UI wait target must be an accessibility identifier or native UI path');
}

function boolValue(value) {
  try {
    return typeof value?.boolValue === 'function' ? Boolean(value.boolValue()) : Boolean(value);
  } catch (_) {
    return false;
  }
}

function waitForUi(target, state, options = {}) {
  if (!['exist', 'visible', 'gone'].includes(state)) {
    return Promise.resolve(waitFailure(
      'INVALID_ARGUMENT',
      'UI wait state must be exist, visible, or gone',
    ));
  }
  let normalized;
  try {
    normalized = normalizeUiTarget(target);
  } catch (error) {
    return Promise.resolve(waitFailure('INVALID_ARGUMENT', errorMessage(error)));
  }
  return runWait(() => {
    const nativeState = stateForUiView(normalized.value);
    const exists = boolValue(nativeState?.objectForKey_?.('exist'));
    const visible = boolValue(nativeState?.objectForKey_?.('visible'));
    if (state === 'exist') return exists;
    return state === 'visible' ? visible : !visible;
  }, options);
}

function waitUntil(predicate, options = {}) {
  if (typeof predicate !== 'function') {
    return Promise.resolve(waitFailure(
      'INVALID_ARGUMENT',
      'Wait predicate must be a function returning a synchronous boolean',
    ));
  }
  return runWait(predicate, options, true);
}

export { waitForUi, waitUntil };
