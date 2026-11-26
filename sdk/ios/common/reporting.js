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

export {
  errorMessage,
  safeConsole,
  safeEmit,
};
