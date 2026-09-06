const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const FIXTURE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState';
const SCENARIO_LABELS = {
  single: 'Single method replacement',
  overload: 'Exact overload replacement',
  filter: 'Invocation argument filter',
  async_cleanup: 'Async scope cleanup',
};

function navigation(scenarioKey) {
  return {
    capabilityMenuId: R.id.api_menu_override,
    capabilityRootId: R.id.api_override_root,
    capabilityName: 'Override',
    scenarioKey,
    scenarioLabel: SCENARIO_LABELS[scenarioKey],
  };
}

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

function fixtureState() {
  let state;
  Java.performNow(() => { state = Java.use(FIXTURE_CLASS).getInstance(); });
  return state;
}

function callCount(state, key) {
  let value;
  Java.performNow(() => { value = Number(state.getOriginalCallCount(key)); });
  return value;
}

/** Replace a single Java method, then prove the original is restored outside scope. */
export async function probeSingleOverride() {
  return withScenarioNavigation(navigation('single'), () => {
  const state = fixtureState();
  let inside;
  Java.performNow(() => {
    inside = Override.run([{
      target: FIXTURE_CLASS,
      method: 'single',
      argumentTypes: ['java.lang.String'],
      withReturn: 'overridden-single',
    }], () => state.single('inside').toString());
  });
  const callsInside = callCount(state, 'single');
  let outside;
  Java.performNow(() => { outside = state.single('outside').toString(); });
  const callsOutside = callCount(state, 'single');
  return {
    passed: inside === 'overridden-single'
      && callsInside === 0
      && outside === 'single:outside'
      && callsOutside === 1,
    api: 'Override.run',
    result: { inside, outside },
    oracle: { callsInside, callsOutside },
  };
  });
}

/** Replace only the int overload and prove the String overload remains original. */
export async function probeExactOverload() {
  return withScenarioNavigation(navigation('overload'), () => {
  const state = fixtureState();
  let intResult;
  let stringResult;
  Java.performNow(() => {
    const method = state.overloaded;
    intResult = Override.run([{
      target: FIXTURE_CLASS,
      method: 'overloaded',
      argumentTypes: ['int'],
      withReturn: 'int-overridden',
    }], () => method.overload('int').call(state, 7).toString());
    stringResult = method.overload('java.lang.String').call(state, 'value').toString();
  });
  const intCalls = callCount(state, 'overloaded(int)');
  const stringCalls = callCount(state, 'overloaded(String)');
  return {
    passed: intResult === 'int-overridden'
      && stringResult === 'string:value'
      && intCalls === 0
      && stringCalls === 1,
    api: 'Override.run(argumentTypes)',
    result: { intResult, stringResult },
    oracle: { intCalls, stringCalls },
  };
  });
}

/** Apply a synchronous argument filter and verify the unmatched call reaches original once. */
export async function probeFilteredOverride() {
  return withScenarioNavigation(navigation('filter'), () => {
  const state = fixtureState();
  let matched;
  let unmatched;
  Java.performNow(() => {
    const results = Override.run([{
      target: FIXTURE_CLASS,
      method: 'featureForScope',
      argumentTypes: ['java.lang.String'],
      filter(invocation) {
        return invocation.args[0]?.toString() === 'enabled-scope';
      },
      withReturn: true,
    }], () => ({
      matched: Boolean(state.featureForScope('enabled-scope')),
      unmatched: Boolean(state.featureForScope('other-scope')),
    }));
    matched = results.matched;
    unmatched = results.unmatched;
  });
  const originalCalls = callCount(state, 'featureForScope');
  return {
    passed: matched === true && unmatched === false && originalCalls === 1,
    api: 'Override.run(filter)',
    result: { matched, unmatched },
    oracle: { originalCalls },
  };
  });
}

/** Keep an override through Promise settlement and verify cleanup afterward. */
export async function probeAsyncCleanup() {
  return withScenarioNavigation(navigation('async_cleanup'), async () => {
    const state = fixtureState();
    const inside = await Override.run([{
      target: FIXTURE_CLASS,
      method: 'single',
      argumentTypes: ['java.lang.String'],
      withReturn: 'async-overridden',
    }], async () => {
      await Promise.resolve();
      let value;
      Java.performNow(() => { value = state.single('inside-async').toString(); });
      return value;
    });
    const callsInside = callCount(state, 'single');
    let outside;
    Java.performNow(() => { outside = state.single('outside-async').toString(); });
    const callsOutside = callCount(state, 'single');
    return {
      passed: inside === 'async-overridden'
        && callsInside === 0
        && outside === 'single:outside-async'
        && callsOutside === 1,
      api: 'Override.run(async action)',
      result: { inside, outside },
      oracle: { callsInside, callsOutside },
    };
  });
}
