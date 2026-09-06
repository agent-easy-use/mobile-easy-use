const EVIDENCE_PREFIX = '@@MOBILE_EVIDENCE@@';

function errorMessage(error) {
  try {
    return String(error?.message ?? error);
  } catch (_) {
    return 'Unknown iOS SDK error';
  }
}

function safeConsole(method, ...args) {
  try {
    const writer = globalThis.console?.[method];
    if (typeof writer === 'function') {
      writer.apply(globalThis.console, args);
    }
  } catch (_) {
  }
}

function safeEmit(channel, payload) {
  const event = {
    source: 'mobile-easy-use',
    platform: 'ios',
    channel,
    timestamp: Date.now(),
    payload,
  };
  try {
    send(event);
  } catch (_) {
  }
  return event;
}

function writeEvidence(category, payload) {
  const record = { category, payload };
  try {
    safeConsole('log', `${EVIDENCE_PREFIX}${JSON.stringify(record)}`);
  } catch (_) {
  }
  return record;
}

function reportEvidenceFailure(kind, key, checkpoint, error) {
  safeConsole('warn', '[mobile-easy-use] iOS evidence capture failed', {
    kind,
    key,
    checkpoint,
    message: errorMessage(error),
  });
}

export {
  errorMessage,
  reportEvidenceFailure,
  safeConsole,
  safeEmit,
  writeEvidence,
};
