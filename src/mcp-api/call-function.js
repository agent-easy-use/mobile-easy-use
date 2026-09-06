import { collectEvidenceLog } from './evidence.js';
import { loadScript } from './load-script.js';
import { finishOperation } from './operation-result.js';

export async function callFunction(owner, { filePath, functionName, args = [] } = {}) {
  validateInput(functionName, args);
  const connection = owner.currentConnection;
  if (owner.state !== 'connected' || connection === null) {
    throw new Error('Connect to MobileEasyUse before calling a function');
  }
  if (connection.activeCall !== null) {
    throw new Error('Another function is already running');
  }

  const evidenceByAction = new Map();
  const activeCall = {
    collectLog(text) {
      collectEvidenceLog(evidenceByAction, text);
    },
  };
  connection.activeCall = activeCall;
  let result;
  let error;
  let didFail = false;
  try {
    try {
      const { modulePath, source } = await loadScript(filePath);
      if (owner.currentConnection !== connection || owner.state !== 'connected'
          || connection.sdkScript.isDestroyed === true) {
        throw new Error('MobileEasyUse session detached before calling the function');
      }
      result = await connection.sdkScript.exports.callFunction(
        modulePath,
        source,
        functionName,
        args,
      );
    } catch (caught) {
      didFail = true;
      error = caught;
    }
    return await finishOperation(owner, evidenceByAction, {
      didFail,
      error,
      failurePrefix: 'Failed to call function',
      result,
    });
  } finally {
    if (connection.activeCall === activeCall) {
      connection.activeCall = null;
    }
  }
}

function validateInput(functionName, args) {
  if (typeof functionName !== 'string' || functionName.length === 0) {
    throw new Error('functionName must be a non-empty string');
  }
  if (!Array.isArray(args)) {
    throw new Error('args must be an array');
  }
}
