export function finishOperation({ didFail, error, failurePrefix, result }) {
  if (didFail) throw wrapOperationError(failurePrefix, error);
  return { result: result === undefined ? null : result };
}

export function operationErrorResult(error) {
  return {
    error: {
      message: errorMessage(error),
      stack: errorStack(error),
    },
  };
}

function wrapOperationError(prefix, error) {
  const detail = errorMessage(error);
  const message = `${prefix}: ${detail}`;
  const wrapped = new Error(message, error instanceof Error ? { cause: error } : undefined);
  wrapped.stack = `${wrapped.name}: ${message}\nCaused by:\n${errorStack(error)}`;
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
