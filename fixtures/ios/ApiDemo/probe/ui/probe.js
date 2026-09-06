const CONTROLLER_CLASS = 'APIController';

function onMain(work) {
  return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
}

async function returnToMain() {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  return IOS.wait.ui('api.menu.ui', 'visible');
}

async function navigate(scenario, action) {
  const fail = (step, result) => ({
    passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'ui', scenario },
  });
  let result;
  let actionError;
  const main = await IOS.wait.ui('api.menu.ui', 'visible');
  if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.ui');
  if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.ui.root', 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click(`api.ui.scenario.${scenario}`);
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui(`api.ui.ready.${scenario}`, 'visible');
  if (!ready.ok) return fail('wait-scenario', ready);
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

function describe(view) {
  if (!view) return null;
  return {
    className: view.$className,
    identifier: String(view.accessibilityIdentifier()),
    label: view.accessibilityLabel() == null ? null : String(view.accessibilityLabel()),
    hidden: Boolean(view.isHidden()),
  };
}

/** Find a UIKit view through identifier shorthand. */
export async function probeFindByIdentifier() {
  return navigate('path', async () => {
    const result = await onMain(() => describe(IOS.ui.find('api.ui.nested.child')));
    return { passed: result?.identifier === 'api.ui.nested.child', api: 'IOS.ui.find(identifier)', result, oracle: { identifier: 'api.ui.nested.child' } };
  });
}

/** Resolve a nested native descendant path without escaping the parent subtree. */
export async function probeFindByPath() {
  return navigate('path', async () => {
    const result = await onMain(() => describe(IOS.ui.find([
      'identifier::api.ui.nested.parent',
      'label::API_FIXED_LABEL',
    ])));
    return { passed: result?.identifier === 'api.ui.nested.child', api: 'IOS.ui.find(path)', result, oracle: { nestedIdentifier: 'api.ui.nested.child' } };
  });
}

/** Return null for an absent native UI target. */
export async function probeMissingView() {
  return navigate('path', async () => {
    const result = IOS.ui.find('api.ui.missing');
    return { passed: result === null, api: 'IOS.ui.find(missing)', result, oracle: { expected: null } };
  });
}

/** Find a hidden view while preserving its hidden state. */
export async function probeFindHiddenView() {
  return navigate('visibility', async () => {
    const result = await onMain(() => describe(IOS.ui.find('api.ui.hidden')));
    return { passed: result?.identifier === 'api.ui.hidden' && result.hidden, api: 'IOS.ui.find(hidden)', result, oracle: { hidden: true } };
  });
}
