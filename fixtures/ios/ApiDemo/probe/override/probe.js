const CONTROLLER_CLASS = 'APIController';
const FIXTURE_CLASS = 'APISDKFixtureState';

function onMain(work) {
  return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
}

async function returnToMain() {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  return IOS.wait.ui('api.menu.probe', 'visible');
}

async function navigate(action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'probe', scenario: 'method_log' } });
  const main = await IOS.wait.ui('api.menu.probe', 'visible');
  if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe');
  if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.method_log');
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.method_log', 'visible');
  if (!ready.ok) return fail('wait-scenario', ready);
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

function callCount(state, selector) {
  return Number(state.originalCallCount_(selector));
}

/** Replace an Objective-C instance method and prove the original IMP is restored. */
export async function probeInstanceOverride() {
  return navigate(() => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const replacement = ObjC.classes.NSString.stringWithString_('overridden-single');
    const inside = Override.run([{
      target: FIXTURE_CLASS,
      selector: '- single:',
      withReturn: replacement,
    }], () => String(state.single_('inside')));
    const callsInside = callCount(state, 'single:');
    const outside = String(state.single_('outside'));
    const callsOutside = callCount(state, 'single:');
    return {
      passed: inside === 'overridden-single' && callsInside === 0 && outside === 'single:outside' && callsOutside === 1,
      api: 'Override.run(instance)',
      result: { inside, outside },
      oracle: { callsInside, callsOutside },
    };
  });
}

/** Replace an Objective-C class method and prove class-selector restoration. */
export async function probeClassOverride() {
  return navigate(() => {
    const replacement = ObjC.classes.NSString.stringWithString_('static-overridden');
    const inside = Override.run([{
      target: FIXTURE_CLASS,
      selector: '+ staticValue',
      withReturn: replacement,
    }], () => String(ObjC.classes[FIXTURE_CLASS].staticValue()));
    const outside = String(ObjC.classes[FIXTURE_CLASS].staticValue());
    return {
      passed: inside === 'static-overridden' && outside === 'static-original',
      api: 'Override.run(class)',
      result: { inside, outside },
      oracle: { restored: true },
    };
  });
}

/** Apply an argument filter and allow an unmatched call through exactly once. */
export async function probeFilteredOverride() {
  return navigate(() => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const observedArguments = [];
    const result = Override.run([{
      target: FIXTURE_CLASS,
      selector: '- featureForScope:',
      filter(invocation) {
        const value = String(new ObjC.Object(invocation.args[0]));
        observedArguments.push(value);
        return value === 'enabled-scope';
      },
      withReturn: true,
    }], () => ({
      matched: Boolean(state.featureForScope_('enabled-scope')),
      unmatched: Boolean(state.featureForScope_('other-scope')),
    }));
    const originalCalls = callCount(state, 'featureForScope:');
    return {
      passed: result.matched === true && result.unmatched === false && originalCalls === 1,
      api: 'Override.run(filter)',
      result: { ...result, observedArguments },
      oracle: { originalCalls },
    };
  });
}

/** Keep an override installed through Promise settlement and clean it afterward. */
export async function probeAsyncCleanup() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const replacement = ObjC.classes.NSString.stringWithString_('async-overridden');
    const inside = await Override.run([{
      target: FIXTURE_CLASS,
      selector: '- single:',
      withReturn: replacement,
    }], async () => {
      await Promise.resolve();
      return String(state.single_('inside-async'));
    });
    const callsInside = callCount(state, 'single:');
    const outside = String(state.single_('outside-async'));
    const callsOutside = callCount(state, 'single:');
    return {
      passed: inside === 'async-overridden' && callsInside === 0 && outside === 'single:outside-async' && callsOutside === 1,
      api: 'Override.run(async)',
      result: { inside, outside },
      oracle: { callsInside, callsOutside },
    };
  });
}
