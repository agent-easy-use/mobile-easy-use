const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const STATE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState';
const SCENARIO_LABELS = {
  activity_root: 'Activity DecorView root',
  dialog: 'Dialog Window root',
  popup_focusable: 'Focusable PopupWindow root',
  popup_nonfocusable: 'Non-focusable PopupWindow root',
  no_focused_window: 'Move task to background',
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
    capabilityMenuId: R.id.api_menu_window,
    capabilityRootId: R.id.api_window_root,
    capabilityName: 'Window',
    scenarioKey,
    scenarioLabel: SCENARIO_LABELS[scenarioKey],
  }, action);
}

function rootSnapshot() {
  const roots = AndroidExp.window.getRootViews();
  let focusedCount = 0;
  const classes = [];
  Java.performNow(() => {
    for (const root of roots) {
      classes.push(root.$className ?? null);
      if (Boolean(root.hasWindowFocus())) focusedCount += 1;
    }
  });
  return { count: roots.length, focusedCount, classes };
}

function windowState() {
  let value;
  Java.performNow(() => {
    const state = Java.use(STATE_CLASS).getInstance();
    value = {
      dialogOpen: Boolean(state.isDialogOpen()),
      popupOpen: Boolean(state.isPopupOpen()),
    };
  });
  return value;
}

function controllerCall(method, ...args) {
  Java.performNow(() => {
    Java.use(CONTROLLER_CLASS)[method](...args);
  });
}

/** Verify getRootViews exposes the focused Activity root. */
export async function probeActivityRoot() {
  return navigate('activity_root', () => {
  const roots = rootSnapshot();
  const target = AndroidExp.ui.find(R.id.api_window_activity_target);
  return {
    passed: roots.count >= 1 && roots.focusedCount === 1 && target !== null,
    api: 'AndroidExp.window.getRootViews',
    result: roots,
    oracle: { activityTargetFound: target !== null, expectedFocusedRoots: 1 },
  };
  });
}

/** Open a Dialog and verify its focused Window root appears. */
export async function probeDialogRoot() {
  return navigate('dialog', async () => {
    const before = rootSnapshot();
    controllerCall('openDialog');
    const targetReady = await AndroidExp.wait.ui(
      R.id.api_window_dialog_target,
      'visible',
      { timeoutMs: 2000, intervalMs: 25 },
    );
    const after = rootSnapshot();
    const target = AndroidExp.ui.find(R.id.api_window_dialog_target);
    const state = windowState();
    controllerCall('closeWindows');
    return {
      passed: targetReady.ok === true
        && state.dialogOpen
        && target !== null
        && after.count > before.count
        && after.focusedCount === 1,
      api: 'AndroidExp.window.getRootViews',
      result: { before, after, targetReady, targetClass: target?.$className ?? null },
      oracle: state,
    };
  });
}

/** Open a focusable PopupWindow and verify it becomes the focused root. */
export async function probeFocusablePopupRoot() {
  return navigate('popup_focusable', async () => {
    const before = rootSnapshot();
    controllerCall('openPopup', true);
    const targetReady = await AndroidExp.wait.ui(
      R.id.api_window_popup_target,
      'visible',
      { timeoutMs: 2000, intervalMs: 25 },
    );
    const after = rootSnapshot();
    const target = AndroidExp.ui.find(R.id.api_window_popup_target);
    const state = windowState();
    controllerCall('closeWindows');
    return {
      passed: targetReady.ok === true
        && state.popupOpen
        && target !== null
        && after.count > before.count
        && after.focusedCount === 1,
      api: 'AndroidExp.window.getRootViews',
      result: { before, after, targetReady, targetClass: target?.$className ?? null },
      oracle: state,
    };
  });
}

/** Open a non-focusable PopupWindow and verify the Activity stays the query root. */
export async function probeNonFocusablePopupRoot() {
  return navigate('popup_nonfocusable', () => {
  const before = rootSnapshot();
  controllerCall('openPopup', false);
  const after = rootSnapshot();
  const activityTarget = AndroidExp.ui.find(R.id.api_window_activity_target);
  const popupTarget = AndroidExp.ui.find(R.id.api_window_popup_target);
  const state = windowState();
  controllerCall('closeWindows');
  return {
    passed: state.popupOpen
      && after.count > before.count
      && after.focusedCount === 1
      && activityTarget !== null
      && popupTarget === null,
    api: 'AndroidExp.window.getRootViews',
    result: { before, after, activityTargetFound: activityTarget !== null, popupTargetFound: popupTarget !== null },
    oracle: state,
  };
  });
}

/** Move the task to background and wait until no App Window root has focus. */
export async function probeNoFocusedWindow() {
  return navigate('no_focused_window', async () => {
    controllerCall('moveTaskToBack');
    const waited = await AndroidExp.wait.until(
      () => rootSnapshot().focusedCount === 0,
      { timeoutMs: 2000, intervalMs: 50 },
    );
    const roots = rootSnapshot();
    return {
      passed: waited.ok === true && roots.focusedCount === 0,
      api: 'AndroidExp.window.getRootViews',
      result: { waited, roots },
      oracle: { expectedFocusedRoots: 0 },
    };
  });
}
