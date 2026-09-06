const CONTROLLER_CLASS = 'APIController';

function onMain(work) {
  return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
}

async function snapshot() {
  const raw = await onMain(() => String(ObjC.classes[CONTROLLER_CLASS].snapshotJSON()));
  return JSON.parse(raw);
}

async function returnToMain() {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  return IOS.wait.ui('api.menu.input', 'visible');
}

function rectValue(rect) {
  const origin = rect?.origin ?? rect?.[0];
  const size = rect?.size ?? rect?.[1];
  return {
    x: Number(origin?.x ?? origin?.[0]),
    y: Number(origin?.y ?? origin?.[1]),
    width: Number(size?.width ?? size?.[0]),
    height: Number(size?.height ?? size?.[1]),
  };
}

async function screenCenter(identifier) {
  return onMain(() => {
    const view = IOS.ui.find(identifier);
    const bounds = rectValue(view.convertRect_toView_(view.bounds(), NULL));
    return {
      x: bounds.x + (bounds.width / 2),
      y: bounds.y + (bounds.height / 2),
    };
  });
}

async function navigate(scenario, action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'input', scenario } });
  const main = await IOS.wait.ui('api.menu.input', 'visible');
  if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.input');
  if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.input.root', 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click(`api.input.scenario.${scenario}`);
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui(`api.input.ready.${scenario}`, 'visible');
  if (!ready.ok) return fail('wait-scenario', ready);
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

/** Click a UIControl by accessibility identifier and verify its native action oracle. */
export async function probeClickByIdentifier() {
  return navigate('click', async () => {
    const result = await IOS.input.click('api.input.click');
    const oracle = await snapshot();
    return { passed: result.ok === true && result.action === 'click' && oracle.counter === 1, api: 'IOS.input.click(identifier)', result, oracle };
  });
}

/** Click a UIControl through identifier and label descendant path steps. */
export async function probeClickByPath() {
  return navigate('click', async () => {
    const result = await IOS.input.click([
      'identifier::api.input.fixture',
      'label::click fixture',
    ]);
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.counter === 1, api: 'IOS.input.click(path)', result, oracle };
  });
}

/** Resolve a native UIView in the target process and click its screen center through XCTest. */
export async function probeClickByUIView() {
  return navigate('click', async () => {
    const view = await onMain(() => IOS.ui.find('api.input.click'));
    const result = await IOS.input.click(view);
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.counter === 1, api: 'IOS.input.click(UIView)', result, oracle };
  });
}

/** Click an absolute screen coordinate through XCTest. */
export async function probeClickByCoordinates() {
  return navigate('click', async () => {
    const point = await screenCenter('api.input.click');
    const result = await IOS.input.click(point);
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.counter === 1, api: 'IOS.input.click({x,y})', result: { ...result, point }, oracle };
  });
}

/** Activate a non-UIControl through accessibilityActivate. */
export async function probeAccessibilityActivation() {
  return navigate('click', async () => {
    const result = await IOS.input.click('api.input.activation');
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.activationCount === 1, api: 'IOS.input.click(accessibility)', result, oracle };
  });
}

/** Insert text through UIKeyInput and verify editingChanged state. */
export async function probeTextInput(text) {
  return navigate('text', async () => {
    const result = await IOS.input.input('api.input.text', text);
    const oracle = await snapshot();
    return { passed: result.ok === true && result.textLength === text.length && oracle.text === text, api: 'IOS.input.input', result, oracle };
  });
}

/** Scroll a fixed vertical UIScrollView and verify contentOffset. */
export async function probeVerticalScroll() {
  return navigate('vertical_scroll', async () => {
    const result = await IOS.input.scroll('api.input.vertical-scroll', 'up', 240);
    const oracle = await snapshot();
    return { passed: result.ok === true && result.direction === 'up' && oracle.scrollY > 0, api: 'IOS.input.scroll(vertical)', result, oracle };
  });
}

/** Scroll a fixed horizontal UIScrollView and verify contentOffset. */
export async function probeHorizontalScroll() {
  return navigate('horizontal_scroll', async () => {
    const result = await IOS.input.scroll('api.input.horizontal-scroll', 'left', 240);
    const oracle = await snapshot();
    return { passed: result.ok === true && result.direction === 'left' && oracle.scrollX > 0, api: 'IOS.input.scroll(horizontal)', result, oracle };
  });
}

/** Verify structured SDK and XCTest failures for invalid targets and arguments. */
export async function probeTargetErrors() {
  return navigate('errors', async () => {
    const missing = await IOS.input.click('api.input.missing');
    const invalid = await IOS.input.click({ x: -1, y: 20 });
    const hiddenView = await onMain(() => IOS.ui.find('api.input.hidden'));
    const hidden = await IOS.input.click(hiddenView);
    const disabled = await IOS.input.click('api.input.disabled');
    const afterDisabled = await snapshot();
    const emptyText = await IOS.input.input('api.input.focus-fail', '');
    const invalidDirection = await IOS.input.scroll('api.input.noncontrol', 'diagonal', 100);
    const invalidDistance = await IOS.input.scroll('api.input.noncontrol', 'up', 0);
    const invalidDuration = await IOS.input.longPress('api.input.noncontrol', 0);
    const result = {
      missing,
      invalid,
      hidden,
      disabled,
      emptyText,
      invalidDirection,
      invalidDistance,
      invalidDuration,
    };
    const expected = {
      missing: 'ELEMENT_NOT_FOUND',
      invalid: 'INVALID_COORDINATES',
      hidden: 'VIEW_NOT_VISIBLE',
      emptyText: 'INVALID_ARGUMENT',
      invalidDirection: 'INVALID_ARGUMENT',
      invalidDistance: 'INVALID_ARGUMENT',
      invalidDuration: 'INVALID_ARGUMENT',
    };
    const passed = Object.entries(expected)
      .every(([key, code]) => result[key]?.error?.code === code)
      && disabled.ok === true
      && afterDisabled.counter === 0;
    return {
      passed,
      api: 'IOS.input(errors)',
      result,
      oracle: { expected, disabledTap: { ok: true, counter: 0, actualCounter: afterDisabled.counter } },
    };
  });
}

/** Send a real XCTest long press to a generic target. */
export async function probeLongPress() {
  return navigate('long_press', async () => {
    const result = await IOS.input.longPress('api.input.long-press', 600);
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.activationCount === 1, api: 'IOS.input.longPress', result, oracle };
  });
}
