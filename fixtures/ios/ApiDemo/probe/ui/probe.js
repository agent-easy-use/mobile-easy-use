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

/** Exercise actual UIKit class lookup, subclass matching, DFS order and mixed paths. */
export async function probeFindByClass() {
  return navigate('class', () => onMain(() => {
    const scope = 'identifier::api.ui.class.scope';
    const paths = {
      exact: ['class::APIClassButton'],
      subclass: [scope, 'class::UIButton'],
      ancestor: [scope, 'class::UIControl'],
      mixed: [scope, 'class::APIClassButton', 'label::FIRST'],
      self: ['identifier::api.ui.class.first', 'class::UIButton'],
    };
    const result = Object.fromEntries(Object.entries(paths).map(([key, path]) =>
      [key, describe(IOS.ui.find(path))]));
    return { passed: Object.values(result).every(view => view?.identifier === 'api.ui.class.first'
      && view.className === 'APIClassButton' && !view.hidden), api: 'IOS.ui.find(class path)', result,
    oracle: { identifier: 'api.ui.class.first', className: 'APIClassButton' } };
  }));
}

/** Check class-path misses, scope, no backtracking and hidden UIKit Views. */
export async function probeClassPathBoundaries() {
  return navigate('class', () => onMain(() => {
    const scope = 'identifier::api.ui.class.scope';
    const paths = {
      missing: [scope, 'class::MissingClassButton'],
      caseSensitive: [scope, 'class::apiclassbutton'],
      baseIsNotSubclass: ['identifier::api.ui.class.outside', 'class::APIClassButton'],
      noBacktracking: [scope, 'class::UIButton', 'label::SECOND'],
      noEscape: [scope, 'class::APIClassButton', 'identifier::api.ui.class.outside'],
    };
    const misses = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, IOS.ui.find(path) === null]));
    const hidden = describe(IOS.ui.find(['identifier::api.ui.class.hidden', 'class::APIClassButton']));
    let rejectsEmpty = false;
    try { IOS.ui.find(['class::']); } catch (error) { rejectsEmpty = /Invalid UI path/.test(error.message); }
    return { passed: Object.values(misses).every(Boolean) && rejectsEmpty
      && hidden?.identifier === 'api.ui.class.hidden' && hidden.hidden,
    api: 'IOS.ui.find(class path boundaries)', result: { misses, hidden, rejectsEmpty },
    oracle: { allMiss: true, hiddenIdentifier: 'api.ui.class.hidden', hidden: true, rejectsEmpty: true } };
  }));
}

/** Click the first subclass via its base class and verify real state, screenshots and evidence. */
export async function probeClassActions() {
  return navigate('class', async () => {
    const path = ['identifier::api.ui.class.scope', 'class::UIButton'];
    const readState = () => onMain(() => ({
      clickCount: Number(ObjC.classes.APISDKFixtureState.sharedState().counter()),
      first: String(IOS.ui.find('api.ui.class.first').currentTitle()),
      second: String(IOS.ui.find('api.ui.class.second').currentTitle()),
      outside: String(IOS.ui.find('api.ui.class.outside').currentTitle()),
    }));
    const before = await readState();
    const ready = await IOS.wait.ui(path, 'visible');
    if (!ready.ok) return { passed: false, api: 'IOS.wait.ui(class path)', result: ready, oracle: before };
    const click = await Probe.evidence.withUiEvidence(() => Probe.evidence.withStateEvidence(
      () => IOS.input.click(path), 'class-ui-v1', { state: readState }), 'class-ui-v1', { first: path });
    const after = await readState();
    const screenshot = await IOS.screenshot({ includeWindow: true, targets: {
      first: path, hidden: ['identifier::api.ui.class.hidden', 'class::APIClassButton'],
    } });
    return { passed: click.ok === true && before.clickCount === 0 && before.first === 'FIRST'
      && before.second === 'SECOND' && before.outside === 'OUTSIDE'
      && after.clickCount === 1 && after.first === 'FIRST:1' && after.second === 'SECOND' && after.outside === 'OUTSIDE'
      && screenshot.ok === true && Boolean(screenshot.window) && Boolean(screenshot.targets.first)
      && !screenshot.targets.hidden, api: 'class path wait/input/screenshot/evidence',
    evidenceContract: 'class-ui-v1', result: { click, screenshot }, oracle: { before, after } };
  });
}
