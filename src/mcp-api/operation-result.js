import { writeEvidenceFiles } from './evidence.js';

export async function finishOperation(owner, evidenceByAction, {
  didFail,
  error,
  failurePrefix,
  result,
}) {
  let evidence;
  try {
    evidence = await writeEvidenceFiles(
      evidenceByAction,
      owner.evidenceDirectory,
      owner.createEvidenceId,
    );
  } catch (evidenceError) {
    if (didFail) {
      throw wrapOperationError(
        failurePrefix,
        error,
        [],
        `Evidence write also failed: ${errorMessage(evidenceError)}`,
      );
    }
    throw wrapOperationError('Failed to write evidence', evidenceError, []);
  }

  if (didFail) {
    throw wrapOperationError(failurePrefix, error, evidence);
  }
  return {
    result: result === undefined ? null : result,
    evidence,
  };
}

export function operationErrorResult(error) {
  return {
    error: {
      message: errorMessage(error),
      stack: errorStack(error),
    },
    evidence: Array.isArray(error?.evidence) ? error.evidence : [],
  };
}

function wrapOperationError(prefix, error, evidence, suffix = null) {
  const detail = errorMessage(error);
  const message = `${prefix}: ${detail}${suffix === null ? '' : `; ${suffix}`}`;
  const wrapped = new Error(message, error instanceof Error ? { cause: error } : undefined);
  wrapped.stack = `${wrapped.name}: ${message}\nCaused by:\n${errorStack(error)}`;
  wrapped.evidence = evidence;
  return wrapped;
}

function errorMessage(error) {
  if (error !== null && typeof error === 'object'
      && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

function errorStack(error) {
  if (error !== null && typeof error === 'object'
      && typeof error.stack === 'string' && error.stack.length > 0) {
    return error.stack;
  }
  return `Error: ${errorMessage(error)}`;
}
