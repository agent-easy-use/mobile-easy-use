const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const STATE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState';
const NAVIGATION = {
  capabilityMenuId: R.id.api_menu_evidence,
  capabilityRootId: R.id.api_evidence_root,
  capabilityName: 'Evidence',
  scenarioKey: 'state',
  scenarioLabel: 'State before and after action',
};

async function revealCapabilityItem(resourceId) {
  let ready = await AndroidExp.wait.ui(resourceId, 'visible', { timeoutMs: 300, intervalMs: 50 });
  for (let attempt = 0; !ready.ok && attempt < 4; attempt += 1) {
    const scrolled = await AndroidExp.input.scroll(R.id.api_main_list, 'up');
    if (!scrolled.ok) return ready;
    ready = await AndroidExp.wait.ui(resourceId, 'visible', { timeoutMs: 500, intervalMs: 50 });
  }
  return ready;
}

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
    const result = await AndroidExp.wait.ui(R.id.api_main_root, 'visible');
    return result.ok ? { passed: true } : failure('wait-main-after-return', result);
  };
  const main = await revealCapabilityItem(config.capabilityMenuId);
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

function clickCount() {
  let value;
  Java.performNow(() => { value = Number(Java.use(STATE_CLASS).getInstance().getClickCount()); });
  return value;
}

/** Capture clickCount before and after one SDK click action. */
export async function probeClickStateEvidence() {
  return withScenarioNavigation(NAVIGATION, async () => {
    Java.performNow(() => Java.use(CONTROLLER_CLASS).reset());
    const prepared = await AndroidExp.wait.ui(
      R.id.api_evidence_state_click,
      'visible',
      { timeoutMs: 2000, intervalMs: 25 },
    );
    if (!prepared.ok) {
      return { passed: false, api: 'Probe.evidence.withStateEvidence', result: { prepared }, oracle: { clickCount: clickCount() } };
    }
    const input = await Probe.evidence.withStateEvidence(
      () => AndroidExp.input.click(R.id.api_evidence_state_click),
      'ApiDemo click state evidence',
      {
        'ApiDemoState#clickCount': clickCount,
      },
    );
    const after = clickCount();
    return {
      passed: input.ok === true && after === 1,
      api: 'Probe.evidence.withStateEvidence',
      result: input,
      oracle: { clickCount: after },
    };
  });
}
