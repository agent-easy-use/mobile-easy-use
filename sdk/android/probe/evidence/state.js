import { runEvidenceAction, writeEvidence } from './utils.js';
import { errorMessage } from '../../common/reporting.js';

async function captureStateEvidence(actionDescription, stateGetters, paths, checkpoint) {
  for (const path of paths) {
    try {
      const getter = stateGetters[path];
      if (typeof getter !== 'function') throw new Error('Getter must be a function');
      const value = await getter();
      writeEvidence('state', { path, actionDescription, checkpoint, value });
    } catch (error) {
      writeEvidence('state', { path, actionDescription, checkpoint, error: errorMessage(error) });
    }
  }
}

async function withStateEvidence(action, actionDescription, stateGetters) {
  if (typeof action !== 'function') {
    throw new Error('withStateEvidence action must be a function');
  }
  if (stateGetters === null || typeof stateGetters !== 'object' || Array.isArray(stateGetters)) {
    throw new Error('withStateEvidence stateGetters must map paths to getters');
  }
  const paths = Object.keys(stateGetters);
  if (paths.some(path => path.length === 0)) throw new Error('State paths must not be empty');
  await captureStateEvidence(actionDescription, stateGetters, paths, 'before');
  return runEvidenceAction(
    action,
    () => captureStateEvidence(actionDescription, stateGetters, paths, 'after'),
  );
}

export { withStateEvidence };
