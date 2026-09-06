const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const STATE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState';
const SCENARIO_LABELS = {
  click: 'Click and location targets',
  long_press: 'Long press duration',
  text_input: 'KeyCharacterMap text input',
  vertical_scroll: 'Vertical ScrollView gesture',
  horizontal_scroll: 'Horizontal ScrollView gesture',
  target_errors: 'Hidden, zero-size, detached and offscreen targets',
};

function navigationFailure(step, result, expected) {
  return { passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: expected };
}

function fixtureNavigationState() {
  let state;
  Java.performNow(() => {
    const controller = Java.use(CONTROLLER_CLASS);
    state = {
      activity: controller.getActivity().toString(),
      scenario: controller.getScenario().toString(),
    };
  });
  return state;
}

function revealScenario(view) {
  return new Promise((resolveReveal, rejectReveal) => {
    Java.scheduleOnMainThread(() => {
      try {
        const rectangle = Java.use('android.graphics.Rect').$new();
        view.getDrawingRect(rectangle);
        view.requestRectangleOnScreen(rectangle, true);
        resolveReveal();
      } catch (error) {
        rejectReveal(error);
      }
    });
  });
}

async function returnToMain() {
  try {
    Java.performNow(() => Java.use(CONTROLLER_CLASS).returnToMain());
  } catch (error) {
    try {
      await new Promise((resolveReturn, rejectReturn) => {
        Java.performNow(() => {
          const controller = Java.use(CONTROLLER_CLASS);
          const weakReference = Java.cast(
            controller.current.value,
            Java.use('java.lang.ref.WeakReference'),
          );
          const rawActivity = weakReference.get();
          if (rawActivity === null) throw error;
          const activity = Java.cast(
            rawActivity,
            Java.use('com.agenteasyuse.mobileeasyuse.apidemo.ui.CapabilityActivity'),
          );
          Java.scheduleOnMainThread(() => {
            try {
              activity.finish();
              resolveReturn();
            } catch (finishError) {
              rejectReturn(finishError);
            }
          });
        });
      });
    } catch (fallbackError) {
      return navigationFailure(
        'return-to-main',
        { message: fallbackError.message ?? String(fallbackError) },
        { main: true },
      );
    }
  }
  const returned = await AndroidExp.wait.ui(
    R.id.api_menu_input,
    'visible',
    { timeoutMs: 5000, intervalMs: 50 },
  );
  return returned.ok
    ? { passed: true }
    : navigationFailure('wait-main-after-return', returned, { main: true });
}

async function enterScenario(config) {
  let mainReady = await AndroidExp.wait.ui(
    config.capabilityMenuId,
    'visible',
    { timeoutMs: 500, intervalMs: 50 },
  );
  if (!mainReady.ok) {
    const recovered = await returnToMain();
    if (!recovered.passed) return navigationFailure('recover-main', recovered, config);
    mainReady = await AndroidExp.wait.ui(
      config.capabilityMenuId,
      'visible',
      { timeoutMs: 5000, intervalMs: 50 },
    );
  }
  if (!mainReady.ok) return navigationFailure('wait-main-menu', mainReady, config);
  const opened = await AndroidExp.input.click(config.capabilityMenuId);
  if (!opened.ok) return navigationFailure('click-capability', opened, config);
  const catalogReady = await AndroidExp.wait.ui(
    config.capabilityRootId,
    'visible',
    { timeoutMs: 5000, intervalMs: 50 },
  );
  if (!catalogReady.ok) return navigationFailure('wait-capability-catalog', catalogReady, config);
  const scenarioView = AndroidExp.ui.find([`text::${config.scenarioLabel}`]);
  if (scenarioView === null) return navigationFailure('find-scenario-item', { found: false }, config);
  await revealScenario(scenarioView);
  const selected = await AndroidExp.input.click(scenarioView);
  if (!selected.ok) return navigationFailure('click-scenario', selected, config);
  const scenarioReady = await AndroidExp.wait.until(
    () => {
      const state = fixtureNavigationState();
      return state.activity === config.capabilityName && state.scenario === config.scenarioKey;
    },
    { timeoutMs: 5000, intervalMs: 50 },
  );
  return scenarioReady.ok
    ? { passed: true, entered: fixtureNavigationState() }
    : navigationFailure('wait-scenario', scenarioReady, config);
}

async function withScenarioNavigation(config, action) {
  const entered = await enterScenario(config);
  if (!entered.passed) {
    if (AndroidExp.ui.find(config.capabilityRootId) !== null) await returnToMain();
    return entered;
  }
  let result;
  let actionError;
  try {
    result = await action();
  } catch (error) {
    actionError = error;
  }
  const returned = await returnToMain();
  if (actionError !== undefined) throw actionError;
  if (!returned.passed) return returned;
  return { ...result, navigation: { entered: entered.entered, returnedToMain: true } };
}

function navigate(scenarioKey, action) {
  return withScenarioNavigation({
    capabilityMenuId: R.id.api_menu_input,
    capabilityRootId: R.id.api_input_root,
    capabilityName: 'Input',
    scenarioKey,
    scenarioLabel: SCENARIO_LABELS[scenarioKey],
  }, action);
}

function resetFixture() {
  Java.performNow(() => Java.use(CONTROLLER_CLASS).reset());
}

function stateSnapshot() {
  let snapshot;
  Java.performNow(() => {
    const state = Java.use(STATE_CLASS).getInstance();
    const RecordedInputEvent = Java.use(
      'com.agenteasyuse.mobileeasyuse.apidemo.input.RecordedInputEvent',
    );
    const events = Array.from(state.getInputEvents().toArray()).map((rawEvent) => {
      const event = Java.cast(rawEvent, RecordedInputEvent);
      return {
        action: Number(event.action.value),
        downTime: Number(event.downTime.value),
        eventTime: Number(event.eventTime.value),
        x: Number(event.x.value),
        y: Number(event.y.value),
      };
    });
    snapshot = {
      clickCount: Number(state.getClickCount()),
      longPressCount: Number(state.getLongPressCount()),
      inputText: state.getInputText().toString(),
      scrollX: Number(state.getScrollX()),
      scrollY: Number(state.getScrollY()),
      events,
    };
  });
  return snapshot;
}

async function prepareVisible(target) {
  resetFixture();
  return AndroidExp.wait.ui(target, 'visible', { timeoutMs: 2000, intervalMs: 25 });
}

function clickPassed(input, state) {
  const actions = state.events.map((event) => event.action);
  return input.ok === true
    && state.clickCount === 1
    && actions[0] === 0
    && actions[actions.length - 1] === 1;
}

async function runClick(target, expectedTargetType, api) {
  const prepared = await prepareVisible(R.id.api_input_click);
  if (!prepared.ok) return { passed: false, api, result: { prepared }, oracle: stateSnapshot() };
  const input = await AndroidExp.input.click(target);
  const oracle = stateSnapshot();
  return {
    passed: clickPassed(input, oracle) && input.targetType === expectedTargetType,
    api,
    result: input,
    oracle,
  };
}

/** Click the fixture through the resource-ID overload. */
export async function probeClickById() {
  return navigate('click', () => runClick(
    R.id.api_input_click,
    'id',
    'AndroidExp.input.click(resourceId)',
  ));
}

/** Click the fixture through the native UI-path overload. */
export async function probeClickByPath() {
  return navigate('click', () => runClick(
    [`id::${R.id.api_input_click}`],
    'path',
    'AndroidExp.input.click(path)',
  ));
}

/** Click an already-resolved concrete View wrapper. */
export async function probeClickByView() {
  return navigate('click', async () => {
  resetFixture();
  const prepared = await AndroidExp.wait.ui(R.id.api_input_click, 'visible', { timeoutMs: 2000, intervalMs: 25 });
  if (!prepared.ok) return { passed: false, api: 'AndroidExp.input.click(view)', result: { prepared }, oracle: stateSnapshot() };
  const view = AndroidExp.ui.find(R.id.api_input_click);
  const input = await AndroidExp.input.click(view);
  const oracle = stateSnapshot();
  return {
    passed: clickPassed(input, oracle) && input.targetType === 'view',
    api: 'AndroidExp.input.click(view)',
    result: input,
    oracle,
  };
  });
}

/** Click the center of the location pad through physical screen coordinates. */
export async function probeClickByLocation() {
  return navigate('click', async () => {
  resetFixture();
  const prepared = await AndroidExp.wait.ui(R.id.api_input_location_pad, 'visible', { timeoutMs: 2000, intervalMs: 25 });
  if (!prepared.ok) return { passed: false, api: 'AndroidExp.input.click(location)', result: { prepared }, oracle: stateSnapshot() };
  const view = AndroidExp.ui.find(R.id.api_input_location_pad);
  let location;
  Java.performNow(() => {
    const values = Java.array('int', [0, 0]);
    view.getLocationOnScreen(values);
    location = {
      x: Number(values[0].value ?? values[0]) + (Number(view.getWidth()) / 2),
      y: Number(values[1].value ?? values[1]) + (Number(view.getHeight()) / 2),
    };
  });
  const input = await AndroidExp.input.click(location);
  const oracle = stateSnapshot();
  return {
    passed: clickPassed(input, oracle) && input.targetType === 'location',
    api: 'AndroidExp.input.click(location)',
    result: { ...input, requestedLocation: location },
    oracle,
  };
  });
}

function centerOfView(view) {
  let location;
  Java.performNow(() => {
    const values = Java.array('int', [0, 0]);
    view.getLocationOnScreen(values);
    location = {
      x: Number(values[0].value ?? values[0]) + (Number(view.getWidth()) / 2),
      y: Number(values[1].value ?? values[1]) + (Number(view.getHeight()) / 2),
    };
  });
  return location;
}

function resolveTarget(resourceId, targetType) {
  if (targetType === 'id') return resourceId;
  if (targetType === 'path') return [`id::${resourceId}`];
  const view = AndroidExp.ui.find(resourceId);
  return targetType === 'view' ? view : centerOfView(view);
}

function pressEventsPassed(events) {
  return events.length === 2 && events[0].action === 0 && events[1].action === 1;
}

async function runLongPress(targetType) {
  const resourceId = R.id.api_input_long_press;
  const prepared = await prepareVisible(resourceId);
  const api = `AndroidExp.input.longPress(${targetType})`;
  if (!prepared.ok) return { passed: false, api, result: { prepared }, oracle: stateSnapshot() };
  const input = await AndroidExp.input.longPress(resolveTarget(resourceId, targetType));
  const oracle = stateSnapshot();
  const observedDurationMs = pressEventsPassed(oracle.events)
    ? oracle.events[1].eventTime - oracle.events[0].downTime
    : -1;
  return {
    passed: input.ok === true
      && input.action === 'longPress'
      && input.targetType === targetType
      && input.injectedEvents === 2
      && oracle.longPressCount === 1
      && oracle.clickCount === 0
      && pressEventsPassed(oracle.events)
      && observedDurationMs >= 500,
    api,
    result: { ...input, observedDurationMs },
    oracle,
  };
}

async function runTextInput(targetType, text) {
  const resourceId = R.id.api_input_text;
  const prepared = await prepareVisible(resourceId);
  const api = `AndroidExp.input.input(${targetType})`;
  if (!prepared.ok) return { passed: false, api, result: { prepared }, oracle: stateSnapshot() };
  const input = await AndroidExp.input.input(resolveTarget(resourceId, targetType), text);
  const oracle = stateSnapshot();
  return {
    passed: input.ok === true
      && input.action === 'input'
      && input.targetType === targetType
      && input.textLength === text.length
      && oracle.inputText === text
      && pressEventsPassed(oracle.events),
    api,
    result: input,
    oracle,
  };
}

async function runVerticalScroll(targetType) {
  const resourceId = R.id.api_input_vertical_scroll;
  const prepared = await prepareVisible(resourceId);
  const api = `AndroidExp.input.scroll(${targetType})`;
  if (!prepared.ok) return { passed: false, api, result: { prepared }, oracle: stateSnapshot() };
  const input = await AndroidExp.input.scroll(resolveTarget(resourceId, targetType), 'up');
  const oracle = stateSnapshot();
  const actions = oracle.events.map((event) => event.action);
  return {
    passed: input.ok === true
      && input.action === 'scroll'
      && input.targetType === targetType
      && input.direction === 'up'
      && input.startY > input.endY
      && input.injectedEvents === oracle.events.length
      && actions[0] === 0
      && actions[actions.length - 1] === 1
      && actions.includes(2)
      && oracle.scrollY > 0,
    api,
    result: input,
    oracle,
  };
}

/** Long-press through the resource-ID overload. */
export async function probeLongPress() {
  return navigate('long_press', () => runLongPress('id'));
}

/** Long-press through the UI-path overload. */
export async function probeLongPressByPath() {
  return navigate('long_press', () => runLongPress('path'));
}

/** Long-press through an already-resolved View wrapper. */
export async function probeLongPressByView() {
  return navigate('long_press', () => runLongPress('view'));
}

/** Long-press through physical screen coordinates. */
export async function probeLongPressByLocation() {
  return navigate('long_press', () => runLongPress('location'));
}

/** Input representable ASCII text through the resource-ID overload. */
export async function probeTextInput(text) {
  return navigate('text_input', () => runTextInput('id', text));
}

/** Input representable ASCII text through the UI-path overload. */
export async function probeTextInputByPath(text) {
  return navigate('text_input', () => runTextInput('path', text));
}

/** Input representable ASCII text through an already-resolved View wrapper. */
export async function probeTextInputByView(text) {
  return navigate('text_input', () => runTextInput('view', text));
}

/** Input representable ASCII text through physical screen coordinates. */
export async function probeTextInputByLocation(text) {
  return navigate('text_input', () => runTextInput('location', text));
}

/** Scroll upward through the resource-ID overload. */
export async function probeVerticalScroll() {
  return navigate('vertical_scroll', () => runVerticalScroll('id'));
}

/** Scroll upward through the UI-path overload. */
export async function probeVerticalScrollByPath() {
  return navigate('vertical_scroll', () => runVerticalScroll('path'));
}

/** Scroll upward through an already-resolved View wrapper. */
export async function probeVerticalScrollByView() {
  return navigate('vertical_scroll', () => runVerticalScroll('view'));
}

/** Scroll upward through physical screen coordinates. */
export async function probeVerticalScrollByLocation() {
  return navigate('vertical_scroll', () => runVerticalScroll('location'));
}

/** Inject a leftward finger gesture and verify horizontal content offset changes. */
export async function probeHorizontalScroll() {
  return navigate('horizontal_scroll', async () => {
  const prepared = await prepareVisible(R.id.api_input_horizontal_scroll);
  if (!prepared.ok) return { passed: false, api: 'AndroidExp.input.scroll', result: { prepared }, oracle: stateSnapshot() };
  const input = await AndroidExp.input.scroll(R.id.api_input_horizontal_scroll, 'left');
  const oracle = stateSnapshot();
  return {
    passed: input.ok === true && input.direction === 'left' && oracle.scrollX > 0,
    api: 'AndroidExp.input.scroll',
    result: input,
    oracle,
  };
  });
}

/** Verify structured failures for hidden, zero-size, detached and invalid-coordinate targets. */
export async function probeTargetErrors() {
  return navigate('target_errors', async () => {
  resetFixture();
  let detached;
  Java.performNow(() => { detached = Java.use(CONTROLLER_CLASS).getDetachedView(); });
  const hidden = await AndroidExp.input.click(R.id.api_input_hidden);
  const zeroSize = await AndroidExp.input.click(R.id.api_input_zero_size);
  const detachedResult = await AndroidExp.input.click(detached);
  const invalidCoordinates = await AndroidExp.input.click({ x: -1, y: 10 });
  const oracle = stateSnapshot();
  return {
    passed: hidden.ok === false && hidden.error.code === 'VIEW_NOT_VISIBLE'
      && zeroSize.ok === false && zeroSize.error.code === 'VIEW_NOT_VISIBLE'
      && detachedResult.ok === false && detachedResult.error.code === 'VIEW_NOT_VISIBLE'
      && invalidCoordinates.ok === false && invalidCoordinates.error.code === 'INVALID_COORDINATES'
      && oracle.clickCount === 0,
    api: 'AndroidExp.input failure semantics',
    result: { hidden, zeroSize, detached: detachedResult, invalidCoordinates },
    oracle,
  };
  });
}
