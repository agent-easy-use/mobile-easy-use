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

const stateMain = work => AndroidExp.runOnMainThread(work);
const stateWrapper = () => Java.use(STATE_CLASS).getInstance();
const stateCount = () => Number(stateWrapper().getClickCount());
const stateIncrement = () => stateWrapper().incrementClick();
const stateOnMain = () => Java.use('android.os.Looper').getMainLooper().equals(Java.use('android.os.Looper').myLooper());
const stateReset = () => stateWrapper().reset('Evidence', 'state');
const stateNavigate = action => withScenarioNavigation(NAVIGATION, action);

async function stateRuntimeScenario(name, action) {
  return stateNavigate(async () => {
    await stateMain(stateReset);
    const contract = `state-runtime-${name}-v1`;
    const result = await action(contract);
    return {...result, api: 'Probe.evidence.withStateEvidence', evidenceContract: contract};
  });
}

/** Await real main-thread reads in order around a native state change. */
export async function probeAsyncStateGetters() {
  return stateRuntimeScenario('async', async contract => {
    const order = [];
    let phase = 'before';
    const result = await Probe.evidence.withStateEvidence(async () => {
      order.push('action');
      await stateMain(() => stateIncrement());
      phase = 'after';
      return 'action-result';
    }, contract, {
      counter: () => stateMain(() => {
        order.push(phase + ':counter');
        if (!stateOnMain()) throw Error('NOT_MAIN_THREAD');
        return stateCount();
      }),
      mainThread: () => stateMain(() => { order.push(phase + ':mainThread'); return stateOnMain(); }),
      syncNull: () => { order.push(phase + ':syncNull'); return null; },
      secondCounter: () => stateMain(() => { order.push(phase + ':secondCounter'); return stateCount(); }),
    });
    const expected = ['before:counter', 'before:mainThread', 'before:syncNull', 'before:secondCounter',
      'action', 'after:counter', 'after:mainThread', 'after:syncNull', 'after:secondCounter'];
    const count = await stateMain(stateCount);
    return {passed: result === 'action-result' && count === 1 && JSON.stringify(order) === JSON.stringify(expected),
      result, oracle: {count, order}};
  });
}

/** Thrown and rejected getters record errors without interrupting the action. */
export async function probeStateGetterErrors() {
  return stateRuntimeScenario('getter-errors', async contract => {
    const result = await Probe.evidence.withStateEvidence(async () => {
      await stateMain(stateIncrement); return 'action-result';
    }, contract, {
      counter: () => stateMain(stateCount),
      validNull: () => null,
      rejection: () => Promise.reject(Error('ASYNC_GETTER_FAILED')),
      exception: () => { throw Error('SYNC_GETTER_FAILED'); },
    });
    const count = await stateMain(stateCount);
    return {passed: result === 'action-result' && count === 1, result, oracle: {count}};
  });
}

/** Before/after failures remain evidence while the original action rejection survives. */
export async function probeStateFailureIsolation() {
  return stateRuntimeScenario('failure', async contract => {
    let actionRan = false;
    const originalError = Error('EXPECTED_ACTION_FAILURE');
    let preserved = false;
    try {
      await Probe.evidence.withStateEvidence(async () => {
        await stateMain(stateIncrement); actionRan = true; throw originalError;
      }, contract, {
        counter: () => stateMain(stateCount),
        recover: async () => { if (!actionRan) throw Error('BEFORE_UNAVAILABLE'); return null; },
        failAfter: async () => { if (actionRan) throw Error('AFTER_UNAVAILABLE'); return 7; },
      });
    } catch (error) { preserved = error === originalError; }
    const count = await stateMain(stateCount);
    return {passed: actionRan && preserved && count === 1, result: {preserved}, oracle: {count}};
  });
}
