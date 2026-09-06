const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const SCENARIO_LABELS = {
  immediate: 'Already existing and visible',
  delayed_visible: 'Hidden target becomes visible',
  delayed_gone: 'Visible target becomes gone',
  attach_detach: 'Attach and detach a View instance',
  resize: 'Zero-size target becomes visible',
  timeout: 'Condition never changes',
};

async function withScenarioNavigation(config, action) {
  const failure = (step, result) => ({
    passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: config,
  });
  const returnToMain = async () => {
    try {
      Java.performNow(() => Java.use(CONTROLLER_CLASS).returnToMain());
    } catch (error) {
      return failure('return-to-main', { message: error.message ?? String(error) });
    }
    const result = await AndroidExp.wait.ui(R.id.api_menu_input, 'visible');
    return result.ok ? { passed: true } : failure('wait-main-after-return', result);
  };
  const main = await AndroidExp.wait.ui(config.capabilityMenuId, 'visible');
  if (!main.ok) return failure('wait-main-menu', main);
  const opened = await AndroidExp.input.click(config.capabilityMenuId);
  if (!opened.ok) return failure('click-capability', opened);
  const catalog = await AndroidExp.wait.ui(config.capabilityRootId, 'visible');
  if (!catalog.ok) {
    await returnToMain();
    return failure('wait-capability-catalog', catalog);
  }
  const scenarioView = AndroidExp.ui.find([`text::${config.scenarioLabel}`]);
  if (scenarioView === null) {
    await returnToMain();
    return failure('find-scenario-item', { found: false });
  }
  await new Promise((resolveReveal, rejectReveal) => Java.scheduleOnMainThread(() => {
    try {
      const rectangle = Java.use('android.graphics.Rect').$new();
      scenarioView.getDrawingRect(rectangle);
      scenarioView.requestRectangleOnScreen(rectangle, true);
      resolveReveal();
    } catch (error) { rejectReveal(error); }
  }));
  const selected = await AndroidExp.input.click(scenarioView);
  if (!selected.ok) {
    await returnToMain();
    return failure('click-scenario', selected);
  }
  const scenario = await AndroidExp.wait.until(() => {
    let matched = false;
    Java.performNow(() => {
      const controller = Java.use(CONTROLLER_CLASS);
      matched = controller.getActivity().toString() === config.capabilityName
        && controller.getScenario().toString() === config.scenarioKey;
    });
    return matched;
  });
  if (!scenario.ok) {
    await returnToMain();
    return failure('wait-scenario', scenario);
  }
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError !== undefined) throw actionError;
  if (!returned.passed) return returned;
  return { ...result, navigation: { returnedToMain: true } };
}

function navigate(scenarioKey, action) {
  return withScenarioNavigation({
    capabilityMenuId: R.id.api_menu_wait,
    capabilityRootId: R.id.api_wait_root,
    capabilityName: 'Wait',
    scenarioKey,
    scenarioLabel: SCENARIO_LABELS[scenarioKey],
  }, action);
}

function controllerCall(method, ...args) {
  Java.performNow(() => Java.use(CONTROLLER_CLASS)[method](...args));
}

function nativeViewState(resourceId) {
  const view = AndroidExp.ui.find(resourceId);
  if (view === null) return { found: false, shown: false, attached: false, width: 0, height: 0 };
  let state;
  Java.performNow(() => {
    state = {
      found: true,
      shown: Boolean(view.isShown()),
      attached: Boolean(view.isAttachedToWindow()),
      width: Number(view.getWidth()),
      height: Number(view.getHeight()),
    };
  });
  return state;
}

/** Wait for an already attached View to exist. */
export async function probeImmediateExist() {
  return navigate('immediate', async () => {
  const result = await AndroidExp.wait.ui(R.id.api_wait_existing, 'exist');
  const oracle = nativeViewState(R.id.api_wait_existing);
  return {
    passed: result.ok === true && oracle.found && oracle.attached,
    api: 'AndroidExp.wait.ui(exist)',
    result,
    oracle,
  };
  });
}

/** Wait for an already attached View to exist through a UI path. */
export async function probeImmediateExistByPath() {
  return navigate('immediate', async () => {
    const result = await AndroidExp.wait.ui(
      [`id::${R.id.api_wait_existing}`],
      'exist',
    );
    const oracle = nativeViewState(R.id.api_wait_existing);
    return {
      passed: result.ok === true && oracle.found && oracle.attached,
      api: 'AndroidExp.wait.ui(path, exist)',
      result,
      oracle,
    };
  });
}

/** Wait for an already attached resolved View instance to exist. */
export async function probeImmediateExistByView() {
  return navigate('immediate', async () => {
    const view = AndroidExp.ui.find(R.id.api_wait_existing);
    const result = await AndroidExp.wait.ui(view, 'exist');
    const oracle = nativeViewState(R.id.api_wait_existing);
    return {
      passed: result.ok === true && oracle.found && oracle.attached,
      api: 'AndroidExp.wait.ui(view, exist)',
      result,
      oracle,
    };
  });
}

/** Schedule an INVISIBLE View to show, then wait for visible. */
export async function probeDelayedVisible() {
  return navigate('delayed_visible', async () => {
  controllerCall('showAfter', 'api_wait_hidden', 250);
  const result = await AndroidExp.wait.ui(
    R.id.api_wait_hidden,
    'visible',
    { timeoutMs: 2000, intervalMs: 50 },
  );
  const oracle = nativeViewState(R.id.api_wait_hidden);
  return {
    passed: result.ok === true && oracle.shown && oracle.width > 0 && oracle.height > 0,
    api: 'AndroidExp.wait.ui(visible)',
    result,
    oracle,
  };
  });
}

/** Wait through a UI path until an INVISIBLE View becomes visible. */
export async function probeDelayedVisibleByPath() {
  return navigate('delayed_visible', async () => {
    controllerCall('showAfter', 'api_wait_hidden', 250);
    const result = await AndroidExp.wait.ui(
      [`id::${R.id.api_wait_hidden}`],
      'visible',
      { timeoutMs: 2000, intervalMs: 50 },
    );
    const oracle = nativeViewState(R.id.api_wait_hidden);
    return {
      passed: result.ok === true && oracle.shown && oracle.width > 0 && oracle.height > 0,
      api: 'AndroidExp.wait.ui(path, visible)',
      result,
      oracle,
    };
  });
}

/** Wait through a resolved View instance until it becomes visible. */
export async function probeDelayedVisibleByView() {
  return navigate('delayed_visible', async () => {
    const view = AndroidExp.ui.find(R.id.api_wait_hidden);
    controllerCall('showAfter', 'api_wait_hidden', 250);
    const result = await AndroidExp.wait.ui(
      view,
      'visible',
      { timeoutMs: 2000, intervalMs: 50 },
    );
    const oracle = nativeViewState(R.id.api_wait_hidden);
    return {
      passed: result.ok === true && oracle.shown && oracle.width > 0 && oracle.height > 0,
      api: 'AndroidExp.wait.ui(view, visible)',
      result,
      oracle,
    };
  });
}

/** Schedule a visible View to become GONE, then wait for gone. */
export async function probeDelayedGone() {
  return navigate('delayed_gone', async () => {
  controllerCall('hideAfter', 'api_wait_gone', 250);
  const result = await AndroidExp.wait.ui(
    R.id.api_wait_gone,
    'gone',
    { timeoutMs: 2000, intervalMs: 50 },
  );
  const oracle = nativeViewState(R.id.api_wait_gone);
  return {
    passed: result.ok === true && oracle.found && !oracle.shown,
    api: 'AndroidExp.wait.ui(gone)',
    result,
    oracle,
  };
  });
}

/** Wait through a UI path until a visible View becomes GONE. */
export async function probeDelayedGoneByPath() {
  return navigate('delayed_gone', async () => {
    controllerCall('hideAfter', 'api_wait_gone', 250);
    const result = await AndroidExp.wait.ui(
      [`id::${R.id.api_wait_gone}`],
      'gone',
      { timeoutMs: 2000, intervalMs: 50 },
    );
    const oracle = nativeViewState(R.id.api_wait_gone);
    return {
      passed: result.ok === true && oracle.found && !oracle.shown,
      api: 'AndroidExp.wait.ui(path, gone)',
      result,
      oracle,
    };
  });
}

/** Schedule a detached View to attach and wait for resource-ID existence. */
export async function probeDelayedAttach() {
  return navigate('attach_detach', async () => {
  controllerCall('attachAfter', 'api_wait_attach_target', 250);
  const result = await AndroidExp.wait.ui(
    R.id.api_wait_attach_target,
    'exist',
    { timeoutMs: 2000, intervalMs: 50 },
  );
  const oracle = nativeViewState(R.id.api_wait_attach_target);
  return {
    passed: result.ok === true && oracle.found && oracle.attached,
    api: 'AndroidExp.wait.ui(exist)',
    result,
    oracle,
  };
  });
}

/** Save a View instance, schedule its detach and wait through the View overload. */
export async function probeDelayedDetach() {
  return navigate('attach_detach', async () => {
  const view = AndroidExp.ui.find(R.id.api_wait_detach_target);
  controllerCall('detachAfter', 'api_wait_detach_target', 250);
  const result = await AndroidExp.wait.ui(
    view,
    'gone',
    { timeoutMs: 2000, intervalMs: 50 },
  );
  let attached;
  Java.performNow(() => { attached = Boolean(view.isAttachedToWindow()); });
  return {
    passed: result.ok === true && attached === false,
    api: 'AndroidExp.wait.ui(view, gone)',
    result,
    oracle: { attached },
  };
  });
}

/** Schedule a zero-size View to receive bounds, then wait for visible. */
export async function probeDelayedResize() {
  return navigate('resize', async () => {
  controllerCall('resizeAfter', 'api_wait_zero_size', 250);
  const result = await AndroidExp.wait.ui(
    R.id.api_wait_zero_size,
    'visible',
    { timeoutMs: 2000, intervalMs: 50 },
  );
  const oracle = nativeViewState(R.id.api_wait_zero_size);
  return {
    passed: result.ok === true && oracle.shown && oracle.width > 0 && oracle.height > 0,
    api: 'AndroidExp.wait.ui(visible)',
    result,
    oracle,
  };
  });
}

/** Verify an unsatisfied visible wait returns the structured TIMEOUT result. */
export async function probeTimeout() {
  return navigate('timeout', async () => {
  const startedAt = Date.now();
  const result = await AndroidExp.wait.ui(
    R.id.api_wait_never,
    'visible',
    { timeoutMs: 300, intervalMs: 50 },
  );
  const elapsedMs = Date.now() - startedAt;
  return {
    passed: result.ok === false && result.error.code === 'TIMEOUT' && elapsedMs >= 250,
    api: 'AndroidExp.wait.ui(timeout)',
    result: { ...result, elapsedMs },
    oracle: { expectedCode: 'TIMEOUT', minimumElapsedMs: 250 },
  };
  });
}

/** Verify wait.until polls only a synchronous boolean predicate. */
export async function probeUntil() {
  return navigate('immediate', async () => {
  let checks = 0;
  const result = await AndroidExp.wait.until(
    () => {
      checks += 1;
      return checks >= 3;
    },
    { timeoutMs: 1000, intervalMs: 25 },
  );
  return {
    passed: result.ok === true && checks === 3,
    api: 'AndroidExp.wait.until',
    result,
    oracle: { checks, expectedChecks: 3 },
  };
  });
}
