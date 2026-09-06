function errorMessage(error) {
  try {
    return String(error?.message ?? error);
  } catch (_) {
    return 'Unknown probe error';
  }
}

function safeEmit(channel, payload) {
  const event = {
    source: 'mobile-easy-use',
    platform: 'android',
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

function safeConsole(method, ...args) {
  try {
    const writer = globalThis.console?.[method];
    if (typeof writer === 'function') {
      writer.apply(globalThis.console, args);
    }
  } catch (_) {
  }
}

export { errorMessage, safeConsole, safeEmit };
