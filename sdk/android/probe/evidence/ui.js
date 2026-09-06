import { findUiView, requireUiPath } from '../../exp/ui.js';
import { screenshot } from '../../exp/screenshot.js';
import Java from 'frida-java-bridge';
import { reportEvidenceFailure, runEvidenceAction, writeEvidence } from './utils.js';

function runOnMainThread(work) {
  return new Promise((resolve, reject) => {
    Java.scheduleOnMainThread(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requireUiTargets(uiTargets) {
  if (uiTargets === null || typeof uiTargets !== 'object' || Array.isArray(uiTargets)) {
    throw new Error('withUiEvidence uiTargets must be an object mapping uiKey to UI path');
  }
  const entries = Object.entries(uiTargets);
  if (entries.length === 0) {
    throw new Error('withUiEvidence uiTargets must not be empty');
  }
  for (const [uiKey, path] of entries) {
    if (uiKey.length === 0) {
      throw new Error('withUiEvidence uiKey must not be empty');
    }
    requireUiPath(path);
  }
  return entries;
}

function inspectUiEvidenceView(view) {
  if (!view) {
    return {
      className: null,
      value: { exist: false, visible: false, bounds: null, properties: {} },
    };
  }
  let className = view.$className ?? null;
  if (!className) {
    try {
      className = view.getClass?.().getName?.().toString?.() ?? null;
    } catch (_) {
    }
  }
  view = Java.cast(view, Java.use('android.view.View'));
  let attached = true;
  let shown = true;
  let width = 0;
  let height = 0;
  try {
    attached = typeof view.isAttachedToWindow !== 'function'
      || Boolean(view.isAttachedToWindow());
    shown = typeof view.isShown !== 'function' || Boolean(view.isShown());
    width = Number(view.getWidth?.() ?? 0);
    height = Number(view.getHeight?.() ?? 0);
  } catch (_) {
    attached = false;
    shown = false;
  }
  let bounds = null;
  if (Number.isFinite(width) && width >= 0 && Number.isFinite(height) && height >= 0
    && typeof view.getLocationOnScreen === 'function') {
    try {
      const location = Java.array('int', [0, 0]);
      view.getLocationOnScreen(location);
      const x = Number(location[0]?.value ?? location[0]);
      const y = Number(location[1]?.value ?? location[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        bounds = { x, y, width, height };
      }
    } catch (_) {
    }
  }
  return {
    className,
    value: {
      exist: true,
      visible: attached && shown && width > 0 && height > 0,
      bounds,
      properties: {},
    },
  };
}

async function captureUiEvidence(actionDescription, uiTargets, checkpoint) {
  const snapshots = await runOnMainThread(() => {
    const captured = [];
    for (const [uiKey, path] of uiTargets) {
      try {
        const snapshot = inspectUiEvidenceView(findUiView(path));
        captured.push({ uiKey, ...snapshot });
      } catch (error) {
        reportEvidenceFailure('ui', uiKey, checkpoint, error);
      }
    }
    return captured;
  });
  const screenshotResult = await screenshot({
    targets: Object.fromEntries(uiTargets),
    includeWindow: true,
  });
  for (const snapshot of snapshots) {
    writeEvidence('ui', {
      uiKey: snapshot.uiKey,
      className: snapshot.className,
      actionDescription,
      checkpoint,
      value: {
        ...snapshot.value,
        screenshots: {
          window: screenshotResult.ok ? screenshotResult.window ?? null : null,
          element: screenshotResult.ok
            ? screenshotResult.targets[snapshot.uiKey] ?? null
            : null,
        },
      },
    });
  }
}

async function withUiEvidence(action, actionDescription, uiTargets) {
  if (typeof action !== 'function') {
    throw new Error('withUiEvidence action must be a function');
  }
  const normalizedTargets = requireUiTargets(uiTargets);
  await captureUiEvidence(actionDescription, normalizedTargets, 'before');
  return runEvidenceAction(
    action,
    () => captureUiEvidence(actionDescription, normalizedTargets, 'after'),
  );
}

export { withUiEvidence };
