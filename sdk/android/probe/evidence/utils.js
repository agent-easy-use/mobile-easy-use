import { errorMessage, safeConsole } from '../../common/reporting.js';
const EVIDENCE_PREFIX = '@@MOBILE_EVIDENCE@@';

function writeEvidence(category, payload) {
  const record = {
    category,
    payload,
  };
  try {
    safeConsole('log', `${EVIDENCE_PREFIX}${JSON.stringify(record)}`);
  } catch (_) {
  }
  return record;
}

function reportEvidenceFailure(kind, key, checkpoint, error) {
  safeConsole('warn', '[mobile-easy-use] evidence getter failed', {
    kind,
    key,
    checkpoint,
    message: errorMessage(error),
  });
}

async function runEvidenceAction(action, onFinally) {
  try {
    return await action();
  } finally {
    try {
      await onFinally();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] evidence finalizer failed', {
        message: errorMessage(error),
      });
    }
  }
}

export { reportEvidenceFailure, runEvidenceAction, writeEvidence };
