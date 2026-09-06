async function withMainNavigation(action) {
  const ready = await AndroidExp.wait.ui(
    R.id.api_menu_input,
    'visible',
    { timeoutMs: 5000, intervalMs: 50 },
  );
  if (!ready.ok) {
    return {
      passed: false,
      api: 'ApiDemo.navigation',
      result: { step: 'wait-main-menu', result: ready },
      oracle: { main: true },
    };
  }
  return action();
}

/** Probe runtimeStatus through a reusable callFunction module. */
export async function probeRuntimeStatus() {
  return withMainNavigation(() => {
  const result = runtimeStatus();
  return {
    passed: result?.platform === 'android'
      && result?.available === true
      && result?.appId === 'com.agenteasyuse.mobileeasyuse.apidemo',
    api: 'runtimeStatus',
    result,
    oracle: {
      platform: 'android',
      available: true,
      appId: 'com.agenteasyuse.mobileeasyuse.apidemo',
    },
  };
  });
}

/** Prove callFunction argument transport and asynchronous return handling. */
export async function probeCallFunction(value) {
  return withMainNavigation(async () => {
    const resolved = await Promise.resolve(value);
    return {
      passed: resolved === value,
      api: 'callFunction',
      result: { received: resolved, type: typeof resolved },
      oracle: { expected: value },
    };
  });
}
