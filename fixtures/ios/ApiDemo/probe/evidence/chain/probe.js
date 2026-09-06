const CONTROLLER_CLASS = 'APIController';
const FIXTURE_CLASS = 'APISDKFixtureState';

function onMain(work) { return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => { try { resolve(work()); } catch (error) { reject(error); } })); }

async function navigate(action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'probe', scenario: 'chain_evidence' } });
  const main = await IOS.wait.ui('api.menu.probe', 'visible'); if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe'); if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible'); if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.chain_evidence'); if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.chain_evidence', 'visible'); if (!ready.ok) return fail('wait-scenario', ready);
  let result; let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  const returned = await IOS.wait.ui('api.menu.probe', 'visible');
  if (actionError) throw actionError; if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

/** Capture one exact Objective-C method plus static and dynamic NSLog TAGs without changing behavior. */
export async function probeMethodAndLogChain() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const actionResult = await Probe.evidence.withChainEvidence(
      async () => {
        await Promise.resolve();
        const value = String(state.single_('chain'));
        state.emitPrimaryLog();
        state.emitSecondaryLog();
        state.emitDynamicTagLog();
        return value;
      },
      'ApiDemo iOS method and log chain',
      new Set(['MEU.ApiDemo', 'MEU.ApiDemo.Other']),
      [{ target: FIXTURE_CLASS, selector: '- single:' }],
    );
    const originalCalls = Number(state.originalCallCount_('single:'));
    return { passed: actionResult === 'single:chain' && originalCalls === 1, api: 'Probe.evidence.withChainEvidence', evidenceContract: 'chain-method-log-v2', result: { actionResult }, oracle: { originalCalls } };
  });
}
