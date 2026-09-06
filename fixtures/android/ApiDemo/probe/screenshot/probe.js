const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const NAVIGATION = {
  capabilityMenuId: R.id.api_menu_evidence,
  capabilityRootId: R.id.api_evidence_root,
  capabilityName: 'Evidence',
  scenarioKey: 'ui',
  scenarioLabel: 'UI before and after action',
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

async function navigate(action) {
  const fail = (step, result) => ({
    passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: NAVIGATION,
  });
  const main = await revealCapabilityItem(NAVIGATION.capabilityMenuId);
  if (!main.ok) return fail('wait-main-menu', main);
  const opened = await AndroidExp.input.click(NAVIGATION.capabilityMenuId);
  if (!opened.ok) return fail('click-capability', opened);
  const catalog = await AndroidExp.wait.ui(NAVIGATION.capabilityRootId, 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const scenarioView = AndroidExp.ui.find([`text::${NAVIGATION.scenarioLabel}`]);
  if (scenarioView === null) return fail('find-scenario', { found: false });
  await AndroidExp.runOnMainThread(() => {
    const rectangle = Java.use('android.graphics.Rect').$new();
    scenarioView.getDrawingRect(rectangle);
    scenarioView.requestRectangleOnScreen(rectangle, true);
  });
  const selected = await AndroidExp.input.click(scenarioView);
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await AndroidExp.wait.until(() => {
    let matched = false;
    Java.performNow(() => {
      const controller = Java.use(CONTROLLER_CLASS);
      matched = controller.getActivity().toString() === NAVIGATION.capabilityName
        && controller.getScenario().toString() === NAVIGATION.scenarioKey;
    });
    return matched;
  });
  if (!ready.ok) return fail('wait-scenario', ready);

  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  Java.performNow(() => Java.use(CONTROLLER_CLASS).returnToMain());
  const returned = await AndroidExp.wait.ui(R.id.api_main_root, 'visible');
  if (actionError !== undefined) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

async function showFixture() {
  Java.performNow(() => Java.use(CONTROLLER_CLASS).showAfter('api_evidence_ui_hidden', 0));
  return AndroidExp.wait.ui(
    R.id.api_evidence_ui_hidden,
    'visible',
    { timeoutMs: 2000, intervalMs: 25 },
  );
}

/** Capture one App Window plus a crop of a visible target. */
export async function probeWindowAndElementScreenshot() {
  return navigate(async () => {
    const visible = await showFixture();
    if (!visible.ok) return { passed: false, api: 'AndroidExp.screenshot', result: visible };
    const result = await AndroidExp.screenshot({
      targets: { hiddenFixture: R.id.api_evidence_ui_hidden },
      includeWindow: true,
    });
    return {
      passed: result.ok === true
        && typeof result.window === 'string'
        && typeof result.targets.hiddenFixture === 'string',
      api: 'AndroidExp.screenshot',
      result,
      oracle: { fixtureVisible: true },
    };
  });
}

/** Capture the App state only after the Driver decides a wait failure is terminal. */
export async function probeDriverFailureScreenshot() {
  return navigate(async () => {
    const failure = await AndroidExp.wait.ui(
      ['tag::api-demo-intentionally-missing'],
      'visible',
      { timeoutMs: 100, intervalMs: 25 },
    );
    if (failure.ok) return { passed: false, api: 'AndroidExp.wait.ui', result: failure };
    const screenshot = await AndroidExp.screenshot();
    return {
      passed: screenshot.ok === true,
      api: 'AndroidExp.screenshot',
      result: { failure, screenshot },
      oracle: { expectedFailure: true },
    };
  });
}
