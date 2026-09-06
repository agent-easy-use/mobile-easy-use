import { errorMessage, runOnMainThread } from '../common/index.js';
import Java from 'frida-java-bridge';
import { findFocusedRootView, findUiView, requireUiPath } from './ui.js';

function waitFailure(code, message, lastCheckError = null) {
  const error = { code, message };
  if (lastCheckError) {
    error.lastCheckError = errorMessage(lastCheckError);
  }
  return { ok: false, error };
}

async function runWait(check, options, synchronous = false) {
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
      if (synchronous && typeof checked !== 'boolean') {
        return waitFailure('INVALID_ARGUMENT', 'Wait predicate must return a boolean');
      }
      const matched = synchronous ? checked : await checked;
      if (typeof matched !== 'boolean') {
        return waitFailure('INVALID_ARGUMENT', 'Wait predicate must return a boolean');
      }
      if (matched) {
        return { ok: true };
      }
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
    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(intervalMs, remainingMs));
    });
  }
}

function waitForUi(target, state, options = {}) {
  if (!['exist', 'visible', 'gone'].includes(state)) {
    return Promise.resolve(waitFailure('INVALID_ARGUMENT', 'UI wait state must be exist, visible, or gone'));
  }
  const isResourceId = typeof target === 'number';
  const isUiPath = Array.isArray(target);
  let viewTarget = null;
  if (isUiPath) {
    try {
      requireUiPath(target);
    } catch (_) {
      return Promise.resolve(waitFailure('INVALID_ARGUMENT', 'UI wait path is invalid'));
    }
  } else if (!isResourceId && target && typeof target === 'object') {
    try {
      Java.performNow(() => {
        viewTarget = Java.cast(target, Java.use('android.view.View'));
      });
    } catch (_) {
      viewTarget = null;
    }
  }
  if ((isResourceId && (!Number.isInteger(target) || target <= 0))
    || (!isResourceId && !isUiPath && (!viewTarget
      || typeof viewTarget.getWidth !== 'function'
      || typeof viewTarget.getHeight !== 'function'))) {
    return Promise.resolve(waitFailure(
      'INVALID_ARGUMENT',
      'UI wait target must be a positive resource ID, UI path, or Android View',
    ));
  }
  return runWait(() => runOnMainThread(() => {
    if ((isResourceId || isUiPath) && !findFocusedRootView()) {
      return false;
    }
    let view = isResourceId || isUiPath ? findUiView(target) : viewTarget;
    if (!view) {
      return state === 'gone';
    }
    view = Java.cast(view, Java.use('android.view.View'));
    const attached = Boolean(view.isAttachedToWindow());
    if (state === 'exist') {
      return attached;
    }
    const visible = attached
      && Boolean(view.isShown())
      && Number(view.getWidth()) > 0
      && Number(view.getHeight()) > 0;
    return state === 'visible' ? visible : !visible;
  }), options);
}

function waitUntil(predicate, options = {}) {
  if (typeof predicate !== 'function') {
    return Promise.resolve(waitFailure(
      'INVALID_ARGUMENT',
      'Wait predicate must be a function returning boolean',
    ));
  }
  return runWait(predicate, options, true);
}

export { waitForUi, waitUntil };
