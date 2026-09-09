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
    const bounds = rectValue(view.convertRect_toCoordinateSpace_(view.bounds(), view.window().screen().coordinateSpace()));
    return {
      x: bounds.x + (bounds.width / 2),
      y: bounds.y + (bounds.height / 2),
    };
  });
}

async function targetFor(identifier, kind) {
  if (kind === 'identifier') return identifier;
  if (kind === 'path') return ['identifier::api.input.fixture', `identifier::${identifier}`];
  if (kind === 'view') return onMain(() => IOS.ui.find(identifier));
  if (kind === 'coordinates') return screenCenter(identifier);
  throw new Error(`Unknown target kind: ${kind}`);
}

async function measured(operation) {
  const started = Date.now();
  const result = await operation();
  return { ...result, elapsedMs: Date.now() - started };
}

async function scrollArea(identifier, targetKind) {
  return onMain(() => {
    const view = IOS.ui.find(identifier);
    const target = targetKind === 'coordinates' ? view.window() : view;
    return rectValue(target.convertRect_toCoordinateSpace_(target.bounds(), view.window().screen().coordinateSpace()));
  });
}

function endpointsInside(area, result) {
  return [[result.startX, result.startY], [result.endX, result.endY]].every(([x, y]) => (
    x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height
  ));
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
    const result = await measured(() => IOS.input.click('api.input.click'));
    const oracle = await snapshot();
    return { passed: result.ok === true && result.action === 'click' && oracle.counter === 1, api: 'IOS.input.click(identifier)', result, oracle };
  });
}

/** Click a UIControl through identifier and label descendant path steps. */
export async function probeClickByPath() {
  return navigate('click', async () => {
    const result = await measured(() => IOS.input.click([
      'identifier::api.input.fixture',
      'label::click fixture',
    ]));
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.counter === 1, api: 'IOS.input.click(path)', result, oracle };
  });
}

/** Resolve a native UIView in the target process and click its screen center through XCTest. */
export async function probeClickByUIView() {
  return navigate('click', async () => {
    const view = await onMain(() => IOS.ui.find('api.input.click'));
    const result = await measured(() => IOS.input.click(view));
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.counter === 1, api: 'IOS.input.click(UIView)', result, oracle };
  });
}

/** Click an absolute screen coordinate through XCTest. */
export async function probeClickByCoordinates() {
  return navigate('click', async () => {
    const point = await screenCenter('api.input.click');
    const result = await measured(() => IOS.input.click(point));
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.counter === 1, api: 'IOS.input.click({x,y})', result: { ...result, point }, oracle };
  });
}

/** Deliver a touch to a non-UIControl and verify its touchesEnded oracle. */
export async function probeCustomViewTouch() {
  return navigate('click', async () => {
    const result = await measured(() => IOS.input.click('api.input.activation'));
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.activationCount === 1
      && oracle.fixtures.activation.touchCount === 1 && oracle.fixtures.activation.accessibilityActivationCount === 0,
    api: 'IOS.input.click(custom UIView)', result, oracle };
  });
}

/** Synthesize text and verify the native editingChanged state. */
export async function probeTextInput(text, targetKind = 'identifier') {
  return navigate('text', async () => {
    const target = await targetFor('api.input.text', targetKind);
    const result = await measured(() => IOS.input.input(target, text));
    const oracle = await snapshot();
    return { passed: result.ok === true && result.textLength === text.length && oracle.text === text, api: `IOS.input.input(${targetKind})`, result, oracle };
  });
}

/** Scroll a fixed vertical UIScrollView and verify contentOffset. */
export async function probeVerticalScroll(targetKind = 'identifier', direction = 'up', distance) {
  return navigate('vertical_scroll', async () => {
    if (direction === 'down') await onMain(() => IOS.ui.find('api.input.vertical-scroll').setContentOffset_([0, 500]));
    const before = await snapshot();
    const target = await targetFor('api.input.vertical-scroll', targetKind);
    const area = await scrollArea('api.input.vertical-scroll', targetKind);
    const result = await measured(() => IOS.input.scroll(target, direction, distance === undefined ? undefined : Number(distance)));
    const oracle = await snapshot();
    const moved = direction === 'up' ? oracle.scrollY > before.scrollY : oracle.scrollY < before.scrollY;
    return { passed: result.ok === true && result.direction === direction && moved && endpointsInside(area, result),
      api: `IOS.input.scroll(${targetKind},${direction})`, result, oracle: { before, after: oracle, area } };
  });
}

/** Scroll a fixed horizontal UIScrollView and verify contentOffset. */
export async function probeHorizontalScroll(targetKind = 'identifier', direction = 'left', distance) {
  return navigate('horizontal_scroll', async () => {
    if (direction === 'right') await onMain(() => IOS.ui.find('api.input.horizontal-scroll').setContentOffset_([500, 0]));
    const before = await snapshot();
    const target = await targetFor('api.input.horizontal-scroll', targetKind);
    const area = await scrollArea('api.input.horizontal-scroll', targetKind);
    const result = await measured(() => IOS.input.scroll(target, direction, distance === undefined ? undefined : Number(distance)));
    const oracle = await snapshot();
    const moved = direction === 'left' ? oracle.scrollX > before.scrollX : oracle.scrollX < before.scrollX;
    return { passed: result.ok === true && result.direction === direction && moved && endpointsInside(area, result),
      api: `IOS.input.scroll(${targetKind},${direction})`, result, oracle: { before, after: oracle, area } };
  });
}

/** Verify structured SDK and XCTest failures for invalid targets and arguments. */
export async function probeTargetErrors() {
  return navigate('errors', async () => {
    const started = Date.now();
    const missing = await IOS.input.click('api.input.missing');
    const invalid = await IOS.input.click({ x: -1, y: 20 });
    const hiddenView = await onMain(() => IOS.ui.find('api.input.hidden'));
    const hidden = await IOS.input.click(hiddenView);
    const disabled = await IOS.input.click('api.input.disabled');
    const disabledPoint = await screenCenter('api.input.disabled');
    const disabledCoordinates = await IOS.input.click(disabledPoint);
    const afterDisabled = await snapshot();
    const emptyText = await IOS.input.input('api.input.focus-fail', '');
    const invalidDirection = await IOS.input.scroll('api.input.noncontrol', 'diagonal', 100);
    const invalidDistance = await IOS.input.scroll('api.input.noncontrol', 'up', 0);
    const invalidDuration = await IOS.input.longPress('api.input.noncontrol', 0);
    const emptyIdentifier = await IOS.input.click('');
    const emptyPath = await IOS.input.click([]);
    const invalidPath = await IOS.input.click(['class::UIButton']);
    const missingPath = await IOS.input.click(['identifier::api.input.fixture', 'identifier::missing']);
    const outside = await IOS.input.click({ x: 99999, y: 99999 });
    const nonView = await IOS.input.click(ObjC.classes.NSString.stringWithString_('not a view'));
    const nonInteractive = await IOS.input.click('api.input.noncontrol');
    const infiniteDistance = await IOS.input.scroll('api.input.noncontrol', 'up', Infinity);
    const infiniteDuration = await IOS.input.longPress('api.input.noncontrol', Infinity);
    const detachedView = await onMain(() => {
      const view = IOS.ui.find('api.input.focus-fail');
      view.retain();
      view.removeFromSuperview();
      return view;
    });
    let detached;
    try { detached = await IOS.input.click(detachedView); }
    finally { await onMain(() => detachedView.release()); }
    const result = {
      missing,
      invalid,
      hidden,
      disabled,
      disabledCoordinates,
      emptyText,
      invalidDirection,
      invalidDistance,
      invalidDuration,
      emptyIdentifier, emptyPath, invalidPath, missingPath, outside, nonView,
      nonInteractive, infiniteDistance, infiniteDuration, detached,
    };
    const expected = {
      missing: 'ELEMENT_NOT_FOUND',
      invalid: 'INVALID_COORDINATES',
      hidden: 'VIEW_NOT_VISIBLE',
      disabled: 'TOUCH_TARGET_MISMATCH',
      emptyText: 'INVALID_ARGUMENT',
      invalidDirection: 'INVALID_ARGUMENT',
      invalidDistance: 'INVALID_ARGUMENT',
      invalidDuration: 'INVALID_ARGUMENT',
      emptyIdentifier: 'INVALID_TARGET', emptyPath: 'INVALID_TARGET', invalidPath: 'INVALID_TARGET',
      missingPath: 'ELEMENT_NOT_FOUND', outside: 'INVALID_COORDINATES', nonView: 'INVALID_TARGET',
      nonInteractive: 'VIEW_NOT_VISIBLE', infiniteDistance: 'INVALID_ARGUMENT',
      infiniteDuration: 'INVALID_ARGUMENT', detached: 'VIEW_NOT_VISIBLE',
    };
    const passed = Object.entries(expected)
      .every(([key, code]) => result[key]?.error?.code === code)
      && disabledCoordinates.ok === true
      && afterDisabled.fixtures.disabled.enabled === 0
      && afterDisabled.counter === 0;
    return {
      passed,
      api: 'IOS.input(errors)',
      result: { ...result, elapsedMs: Date.now() - started },
      oracle: { expected, disabledTap: { point: disabledPoint, counter: afterDisabled.counter, fixture: afterDisabled.fixtures.disabled } },
    };
  });
}

/** Send a real XCTest long press to a generic target. */
export async function probeLongPress(targetKind = 'identifier', durationMs) {
  return navigate('long_press', async () => {
    const target = await targetFor('api.input.long-press', targetKind);
    const result = await measured(() => IOS.input.longPress(target, durationMs === undefined ? undefined : Number(durationMs)));
    const oracle = await snapshot();
    return { passed: result.ok === true && oracle.activationCount === 1, api: `IOS.input.longPress(${targetKind})`, result, oracle };
  });
}

export async function probeTextAppend(targetKind = 'identifier') {
  return navigate('text', async () => {
    const first = await measured(() => IOS.input.input('api.input.text', 'prefix-'));
    const target = await targetFor('api.input.text', targetKind);
    const second = await measured(() => IOS.input.input(target, '中文🙂'));
    const oracle = await snapshot();
    return { passed: first.ok && second.ok && oracle.text === 'prefix-中文🙂', api: `IOS.input.input(append,${targetKind})`, result: { first, second }, oracle };
  });
}

/** Switch A -> B -> A through input itself; verify both native texts and first responders. */
export async function probeTextFocusSwitch(targetKind = 'identifier') {
  return navigate('focus_switch', async () => {
    const fields = async () => {
      const { fixtures } = await snapshot();
      return {
        a: { text: fixtures.text.text, focused: fixtures.text.isFirstResponder },
        b: { text: fixtures.textSecond.text, focused: fixtures.textSecond.isFirstResponder },
      };
    };
    const initial = await fields();
    const steps = [];
    let before = initial;
    const clean = initial.a.text === '' && initial.b.text === ''
      && initial.a.focused === false && initial.b.focused === false;
    if (clean) for (const step of [
      { key: 'a', identifier: 'api.input.text', text: 'A-', a: 'A-', b: '' },
      { key: 'b', identifier: 'api.input.text-second', text: 'B-中文🙂', a: 'A-', b: 'B-中文🙂' },
      { key: 'a', identifier: 'api.input.text', text: '回A🙂', a: 'A-回A🙂', b: 'B-中文🙂' },
    ]) {
      const target = await targetFor(step.identifier, targetKind);
      const result = await measured(() => IOS.input.input(target, step.text));
      const after = await fields();
      const passed = result.ok === true && result.textLength === step.text.length
        && after.a.text === step.a && after.b.text === step.b
        && after.a.focused === (step.key === 'a') && after.b.focused === (step.key === 'b');
      steps.push({ target: step.key, passed, result, before, after });
      before = after;
      if (!passed) break;
    }
    return { passed: clean && steps.length === 3 && steps.every(step => step.passed),
      api: `IOS.input.input(focus switch,${targetKind})`, result: steps, oracle: { initial, final: before } };
  });
}

export async function probeClippedTarget(targetKind = 'identifier') {
  return navigate('geometry', async () => {
    const target = await targetFor('api.input.clipped', targetKind);
    const result = await measured(() => IOS.input.click(target));
    const oracle = await snapshot();
    return { passed: result.ok && oracle.counter === (targetKind === 'coordinates' ? 0 : 1), api: `IOS.input.click(clipped,${targetKind})`, result, oracle };
  });
}

export async function probeCoveredTarget(targetKind = 'identifier') {
  return navigate('geometry', async () => {
    const target = await targetFor('api.input.covered', targetKind);
    const result = await measured(() => IOS.input.click(target));
    const oracle = await snapshot();
    const expected = targetKind === 'coordinates' ? result.ok : result.error?.code === 'TOUCH_TARGET_MISMATCH';
    return { passed: expected && oracle.counter === 0
      && oracle.fixtures.cover.touchCount === (targetKind === 'coordinates' ? 1 : 0),
    api: `IOS.input.click(covered,${targetKind})`, result, oracle };
  });
}

export async function probeFirstMatch(targetKind = 'identifier') {
  return navigate('geometry', async () => {
    const target = targetKind === 'path'
      ? ['identifier::api.input.fixture', 'identifier::api.input.fixture', 'identifier::api.input.duplicate']
      : 'api.input.duplicate';
    const result = await measured(() => IOS.input.click(target));
    const oracle = await snapshot();
    return { passed: result.ok && oracle.counter === 1
      && oracle.fixtures.duplicate0.value === 'count:1' && oracle.fixtures.duplicate1.value === 'count:0',
    api: `IOS.input.click(firstMatch,${targetKind})`, result, oracle };
  });
}

async function windowState() {
  return JSON.parse(await onMain(() => String(ObjC.classes[CONTROLLER_CLASS].inputWindowSnapshotJSON())));
}

async function configureWindow(mode) {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].configureInputWindow_(mode));
}

async function windowTarget(action, kind, front = false) {
  return onMain(() => {
    const view = ObjC.classes[CONTROLLER_CLASS].inputWindowTarget_front_(action, front);
    if (!view) throw new Error('Window fixture target is unavailable');
    const identifier = String(view.accessibilityIdentifier());
    if (kind === 'identifier') return identifier;
    if (kind === 'path') return ['identifier::api.input.fixture', `identifier::${identifier}`];
    if (kind === 'view') return view;
    if (kind !== 'coordinates') throw new Error(`Unknown target kind: ${kind}`);
    const rect = rectValue(view.convertRect_toCoordinateSpace_(view.bounds(), view.window().screen().coordinateSpace()));
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
}

/** One fresh two-window scenario per call; native counters prove which button received the touch. */
export async function probeWindowClick(mode = 'same', targetKind = 'view') {
  if (!['same', 'higher', 'lower', 'hidden', 'passthrough', 'outside', 'top', 'reshow'].includes(mode)) {
    throw new Error(`Unknown window mode: ${mode}`);
  }
  return navigate('windows', async () => {
    await configureWindow(mode);
    const before = await windowState();
    const target = await windowTarget('click', targetKind, mode === 'top');
    const result = await measured(() => IOS.input.click(target));
    const after = await windowState();
    const covered = ['same', 'higher', 'reshow'].includes(mode);
    const rejected = covered && targetKind !== 'coordinates';
    const front = mode === 'top' || (covered && targetKind === 'coordinates');
    const passed = (rejected ? result.ok === false && result.error.code === 'TOUCH_TARGET_MISMATCH' : result.ok === true)
      && after.baseClicks === (!rejected && !front ? 1 : 0)
      && after.frontClicks === (!rejected && front ? 1 : 0);
    return { passed, api: `IOS.input.click(window:${mode},${targetKind})`, result, oracle: { before, after } };
  });
}

/** Cover text, long press and scroll targets with a non-key window at the same level. */
export async function probeWindowBlocked(action, targetKind = 'view') {
  if (!['input', 'longPress', 'scroll'].includes(action) || !['identifier', 'path', 'view'].includes(targetKind)) {
    throw new Error('Expected input/longPress/scroll and identifier/path/view');
  }
  return navigate('windows', async () => {
    await configureWindow('same');
    const before = await windowState();
    const target = await windowTarget(action, targetKind);
    const result = await measured(() => action === 'input' ? IOS.input.input(target, 'hello')
      : action === 'scroll' ? IOS.input.scroll(target, 'up', 100) : IOS.input.longPress(target));
    const after = await windowState();
    return { passed: result.ok === false && result.error.code === 'TOUCH_TARGET_MISMATCH'
      && after.baseClicks === 0 && after.frontClicks === 0 && after.longPresses === 0
      && after.text === '' && after.scrollY === 0,
    api: `IOS.input.${action}(window:same,${targetKind})`, result, oracle: { before, after } };
  });
}

/** Keep the same window instances across visibility/key transitions; never reset the counters. */
export async function probeWindowLifecycle() {
  return navigate('windows', async () => {
    await configureWindow('same');
    const steps = [];
    let baseClicks = 0;
    let frontClicks = 0;
    for (const mode of ['show', 'hide', 'show', 'overlay-key', 'main-key', 'hide', 'show']) {
      await configureWindow(mode);
      const front = mode !== 'hide';
      const before = await windowState();
      const result = await measured(() => windowTarget('click', 'view', front).then((target) => IOS.input.click(target)));
      const coordinate = await windowTarget('click', 'coordinates', front);
      const touch = result.ok ? await measured(() => IOS.input.click(coordinate)) : null;
      if (front) frontClicks += 2; else baseClicks += 2;
      const after = await windowState();
      const passed = result.ok === true && touch?.ok === true
        && after.baseClicks === baseClicks && after.frontClicks === frontClicks;
      steps.push({ mode, passed, result, coordinateTouch: touch, before, after });
      if (!passed) break;
    }
    return { passed: steps.length === 7 && steps.every((step) => step.passed),
      api: 'IOS.input.click(window lifecycle)', result: steps, oracle: await windowState() };
  });
}
