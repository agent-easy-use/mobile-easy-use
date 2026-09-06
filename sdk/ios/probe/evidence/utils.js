import { errorMessage, safeConsole } from '../../common/reporting.js';

async function runEvidenceAction(action, onFinally) {
  try {
    return await action();
  } finally {
    try {
      await onFinally();
    } catch (error) {
      safeConsole('warn', '[mobile-easy-use] iOS evidence finalizer failed', {
        message: errorMessage(error),
      });
    }
  }
}

export { runEvidenceAction };
