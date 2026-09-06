import { collectEvidenceLog } from './evidence.js';
import { finishOperation } from './operation-result.js';

const ASYNC_IIFE_PATTERN = /^\(\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*\}\s*\)\s*\(\s*\)\s*;?\s*$/;

export async function evalScript(owner, { source } = {}) {
  validateSource(source);
  const connection = owner.currentConnection;
  if (owner.state !== 'connected' || connection === null) {
    throw new Error('Connect to Gadget before evaluating a script');
  }
  if (connection.activeCall !== null) {
    throw new Error('Another operation is already running');
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
      if (owner.currentConnection !== connection || owner.state !== 'connected'
          || connection.sdkScript.isDestroyed === true) {
        throw new Error('Gadget session detached before evaluating the script');
      }
      const scriptName = `/eval/${owner.createEvalId()}.js`;
      result = await connection.sdkScript.exports.evalScript(scriptName, source);
    } catch (caught) {
      didFail = true;
      error = caught;
    }
    return await finishOperation(owner, evidenceByAction, {
      didFail,
      error,
      failurePrefix: 'Failed to evaluate script',
      result,
    });
  } finally {
    if (connection.activeCall === activeCall) {
      connection.activeCall = null;
    }
  }
}

function validateSource(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('source must be a non-empty string');
  }
  if (!ASYNC_IIFE_PATTERN.test(source.trim())) {
    throw new Error('source must be an async IIFE: (async () => { ... })()');
  }
}
