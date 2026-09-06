import {
  reportEvidenceFailure,
  writeEvidence,
} from '../../common/reporting.js';
import { runOnMainThread } from '../../common/main-thread.js';
import {
  findUiView,
  inspectUiViewNow,
  requireUiPath,
} from '../../ui/index.js';
import { screenshot } from '../../screenshot.js';
import { runEvidenceAction } from './utils.js';

function requireUiTargets(uiTargets) {
  if (uiTargets === null || typeof uiTargets !== 'object' || Array.isArray(uiTargets)) {
    throw new Error('withUiEvidence uiTargets must map keys to identifiers or UI paths');
  }
  const entries = Object.entries(uiTargets);
  if (entries.length === 0) {
    throw new Error('withUiEvidence uiTargets must not be empty');
  }
  return entries.map(([uiKey, target]) => {
    if (uiKey.length === 0) throw new Error('withUiEvidence uiKey must not be empty');
    const path = typeof target === 'string' ? [`identifier::${target}`] : target;
    requireUiPath(path);
    return [uiKey, path];
  });
}

async function captureUiEvidence(actionDescription, uiTargets, checkpoint) {
  const snapshots = await runOnMainThread(() => {
    const captured = [];
    for (const [uiKey, path] of uiTargets) {
      try {
        const snapshot = inspectUiViewNow(findUiView(path));
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
