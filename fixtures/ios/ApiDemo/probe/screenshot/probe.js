const CONTROLLER_CLASS = 'APIController';

function onMain(work) {
  return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
}

async function navigate(action) {
  const fail = (step, result) => ({
    passed: false,
    api: 'ApiDemo.navigation',
    result: { step, result },
    oracle: { category: 'probe', scenario: 'ui_evidence' },
  });
  const main = await IOS.wait.ui('api.menu.probe', 'visible');
  if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe');
  if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.ui_evidence');
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.ui_evidence', 'visible');
  if (!ready.ok) return fail('wait-scenario', ready);
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  const returned = await IOS.wait.ui('api.menu.probe', 'visible');
  if (actionError) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

async function showFixture() {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].showAfter_delayMs_('hidden', 0));
  return IOS.wait.ui('api.probe.ui.hidden', 'visible', { timeoutMs: 1000, intervalMs: 25 });
}

/** Capture one App Window plus a crop of a visible target. */
export async function probeWindowAndElementScreenshot() {
  return navigate(async () => {
    const visible = await showFixture();
    if (!visible.ok) return { passed: false, api: 'IOS.screenshot', result: visible };
    const result = await IOS.screenshot({
      targets: { hiddenFixture: 'api.probe.ui.hidden' },
      includeWindow: true,
    });
    return {
      passed: result.ok === true
        && typeof result.window === 'string'
        && typeof result.targets.hiddenFixture === 'string',
      api: 'IOS.screenshot',
      result,
      oracle: { fixtureVisible: true },
    };
  });
}

/** Capture the App state only after the Driver decides a wait failure is terminal. */
export async function probeDriverFailureScreenshot() {
  return navigate(async () => {
    const failure = await IOS.wait.ui(
      'api.probe.intentionally-missing',
      'visible',
      { timeoutMs: 100, intervalMs: 25 },
    );
    if (failure.ok) return { passed: false, api: 'IOS.wait.ui', result: failure };
    const screenshot = await IOS.screenshot();
    return {
      passed: screenshot.ok === true,
      api: 'IOS.screenshot',
      result: { failure, screenshot },
      oracle: { expectedFailure: true },
    };
  });
}
