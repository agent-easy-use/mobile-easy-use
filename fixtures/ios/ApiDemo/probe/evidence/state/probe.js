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
