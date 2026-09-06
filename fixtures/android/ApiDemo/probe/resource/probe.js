function readCompiledResourceIds() {
  let ids;
  Java.performNow(() => {
    const AppIds = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$id');
    const AppStrings = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$string');
    ids = {
      target: Number(AppIds.api_resource_id_target.value),
      string: Number(AppStrings.api_resource_string.value),
    };
  });
  return ids;
}

/** Compare dynamic R values with the App's compiled R classes. */
export async function probeResourceResolution() {
  return withScenarioNavigation({
    ...NAVIGATION,
    scenarioKey: 'resolve',
    scenarioLabel: 'Resolve ID and string',
  }, () => {
  const expected = readCompiledResourceIds();
  const result = {
    target: R.id.api_resource_id_target,
    string: R.string.api_resource_string,
  };
  return {
    passed: result.target === expected.target
      && result.string === expected.string
      && result.target > 0
      && result.string > 0,
    api: 'R.<type>.<name>',
    result,
    oracle: expected,
  };
  });
}

/** Verify a missing dynamic resource resolves to zero without poisoning later reads. */
export async function probeMissingResource() {
  return withScenarioNavigation({
    ...NAVIGATION,
    scenarioKey: 'missing',
    scenarioLabel: 'Missing resource returns zero',
  }, () => {
  const missing = R.id.api_resource_missing;
  const existingAfterMissing = R.id.api_resource_id_target;
  const expected = readCompiledResourceIds().target;
  return {
    passed: missing === 0 && existingAfterMissing === expected,
    api: 'R.<type>.<missingName>',
    result: { missing, existingAfterMissing },
    oracle: { missing: 0, existing: expected },
  };
  });
}
const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const NAVIGATION = {
  capabilityMenuId: R.id.api_menu_resource,
  capabilityRootId: R.id.api_resource_root,
  capabilityName: 'R / Resources',
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
