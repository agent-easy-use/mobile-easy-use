import { reportEvidenceFailure, runEvidenceAction, writeEvidence } from './utils.js';

function captureStateEvidence(actionDescription, stateGetters, checkpoint) {
  let entries;
  try {
    entries = Object.entries(stateGetters ?? {});
  } catch (error) {
    reportEvidenceFailure('state', '<getters>', checkpoint, error);
    return;
  }
  for (const [path, getter] of entries) {
    if (typeof getter !== 'function') {
      reportEvidenceFailure('state', path, checkpoint, new Error('Getter must be a function'));
      continue;
    }
    try {
      writeEvidence('state', {
        path,
        actionDescription,
        checkpoint,
        value: getter(),
      });
    } catch (error) {
      reportEvidenceFailure('state', path, checkpoint, error);
    }
  }
}

async function withStateEvidence(action, actionDescription, stateGetters) {
  if (typeof action !== 'function') {
    throw new Error('withStateEvidence action must be a function');
  }
  captureStateEvidence(actionDescription, stateGetters, 'before');
  return runEvidenceAction(
    action,
    () => captureStateEvidence(actionDescription, stateGetters, 'after'),
  );
}

export { withStateEvidence };
