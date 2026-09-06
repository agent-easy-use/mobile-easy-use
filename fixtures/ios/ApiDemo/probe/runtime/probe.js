async function withMain(action) {
  const ready = await IOS.wait.ui('api.menu.ui', 'visible');
  if (!ready.ok) {
    return { passed: false, api: 'ApiDemo.navigation', result: ready, oracle: { main: true } };
  }
  return action();
}

/** Probe runtimeStatus through a reusable callFunction module. */
export async function probeRuntimeStatus() {
  return withMain(() => {
    const result = runtimeStatus();
    return {
      passed: result?.platform === 'ios'
        && result?.available === true
        && result?.appId === 'com.agenteasyuse.mobileeasyuse.apidemo.ios',
      api: 'runtimeStatus',
      result,
      oracle: {
        platform: 'ios',
        available: true,
        appId: 'com.agenteasyuse.mobileeasyuse.apidemo.ios',
      },
    };
  });
}

/** Prove callFunction argument transport and asynchronous return handling. */
export async function probeCallFunction(value) {
  return withMain(async () => {
    const received = await Promise.resolve(value);
    return {
      passed: received === value,
      api: 'callFunction',
      result: { received, type: typeof received },
      oracle: { expected: value },
    };
  });
}
