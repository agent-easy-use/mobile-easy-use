import { errorMessage } from './common/reporting.js';
import { checkUiState, UI_STATES } from './ui/state.js';

function waitFailure(code, message, lastCheckError = null) {
  const error = { code, message };
  if (lastCheckError) error.lastCheckError = errorMessage(lastCheckError);
  return { ok: false, error };
}

async function waitUntil(predicate, options = {}) {
  if (typeof predicate !== 'function') {
    return waitFailure('INVALID_ARGUMENT', 'Wait predicate must be a function returning boolean or Promise<boolean>');
  }
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
      const matched = await predicate();
      if (typeof matched !== 'boolean') {
        return waitFailure('INVALID_ARGUMENT', 'Wait predicate must return a boolean');
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
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, remainingMs)));
  }
}

async function waitForUi(target, state, options = {}) {
  if (!UI_STATES.includes(state)) {
    return waitFailure('INVALID_ARGUMENT', `Unknown UI wait state: ${state}`);
  }
  return waitUntil(() => checkUiState(target, state), options);
}

export { waitForUi, waitUntil };
