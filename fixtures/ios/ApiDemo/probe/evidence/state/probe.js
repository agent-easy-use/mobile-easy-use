const CONTROLLER_CLASS = 'APIController';
const FIXTURE_CLASS = 'APISDKFixtureState';

function onMain(work) { return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => { try { resolve(work()); } catch (error) { reject(error); } })); }

async function navigate(action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'probe', scenario: 'state_evidence' } });
  const main = await IOS.wait.ui('api.menu.probe', 'visible'); if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe'); if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible'); if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.state_evidence'); if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.state_evidence', 'visible'); if (!ready.ok) return fail('wait-scenario', ready);
  let result; let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  const returned = await IOS.wait.ui('api.menu.probe', 'visible');
  if (actionError) throw actionError; if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

/** Capture Objective-C state before and after one semantic click. */
export async function probeClickStateEvidence() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const result = await Probe.evidence.withStateEvidence(
      () => IOS.input.click('api.probe.state.action'),
      'ApiDemo iOS click state',
      {
        counter: () => Number(state.counter()),
        scenario: () => String(state.scenario()),
      },
    );
    const counter = Number(state.counter());
    return { passed: result.ok === true && counter === 1, api: 'Probe.evidence.withStateEvidence', evidenceContract: 'state-click-v2', result, oracle: { counter } };
  });
}

const stateMain = work => IOS.runOnMainThread(work);
const stateWrapper = () => ObjC.classes[FIXTURE_CLASS].sharedState();
const stateCount = () => Number(stateWrapper().counter());
const stateIncrement = () => stateWrapper().increment();
const stateOnMain = () => Boolean(ObjC.classes.NSThread.isMainThread());
const stateReset = () => stateWrapper().resetForCategory_scenario_('probe', 'state_evidence');
const stateNavigate = navigate;

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
