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

/** Verify exact Objective-C and module-qualified Swift class discovery. */
export async function probeFindClass() {
  return withMain(() => {
    const exact = IOS.runtime.findClass(
      'APIMethodMatchFixture',
      ['- match:', '+ calls'],
    );
    const swift = IOS.runtime.findClass(
      'APIFindClassSwiftFixture',
      ['- primarySelector', '- secondarySelector'],
    );
    const swiftRuntimeName = swift?.$className ?? null;
    const qualified = swiftRuntimeName === null
      ? null
      : IOS.runtime.findClass(swiftRuntimeName, ['- primarySelector']);
    const filtered = IOS.runtime.findClass(
      'APIFindClassAmbiguousFixture',
      ['- sharedSelector', '- onlyFirstSelector'],
    );
    const missing = IOS.runtime.findClass(
      'APIFindClassSwiftFixture',
      ['- missingSelector'],
    );
    let ambiguity = null;
    try {
      IOS.runtime.findClass('APIFindClassAmbiguousFixture', ['- sharedSelector']);
    } catch (error) {
      ambiguity = String(error?.message ?? error);
    }
    const ambiguousNames = [
      'APIFindClassModuleOne.APIFindClassAmbiguousFixture',
      'APIFindClassModuleTwo.APIFindClassAmbiguousFixture',
    ];
    const passed = exact?.$className === 'APIMethodMatchFixture'
      && swiftRuntimeName === 'ApiDemo.APIFindClassSwiftFixture'
      && qualified?.$className === swiftRuntimeName
      && filtered?.$className === ambiguousNames[0]
      && missing === null
      && ambiguity !== null
      && ambiguity.includes('unable to determine a unique target')
      && ambiguousNames.every(name => ambiguity.includes(name));
    return {
      passed,
      api: 'IOS.runtime.findClass',
      result: {
        exact: exact?.$className ?? null,
        swift: swiftRuntimeName,
        qualified: qualified?.$className ?? null,
        filtered: filtered?.$className ?? null,
        missing,
        ambiguity,
      },
      oracle: {
        exact: 'APIMethodMatchFixture',
        swift: 'ApiDemo.APIFindClassSwiftFixture',
        filtered: ambiguousNames[0],
        missing: null,
        ambiguousNames,
      },
    };
  });
}
