import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

const CONTROLLER = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const id = name => R.id[`api_${name.replaceAll('.', '_')}`];

async function home() {
  if (!(await inspectPageState()).homeVisible) {
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).returnToMain());
  }
  expect((await AndroidExp.wait.ui(R.id.api_menu_input, 'visible')).ok, 'Main ready').toBe(true);
}

const timeoutTarget = () => R.id.api_wait_never;

async function openScenario(label, scenarioKey) {
  await home();
  expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.wait')))).ok, 'Open wait').toBe(true);
  expect((await AndroidExp.wait.ui(id('wait.root'), 'visible')).ok).toBe(true);
  const target = [`text::${label}`];
  await expect(target).toExist();
  await AndroidExp.runOnMainThread(() => {
    const view = AndroidExp.ui.find(target);
    const rect = Java.use('android.graphics.Rect').$new();
    view.getDrawingRect(rect);
    view.requestRectangleOnScreen(rect, true);
  });
  expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, `Open ${scenarioKey}`).toBe(true);
  expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === scenarioKey)).ok, 'Scenario ready').toBe(true);
}

describe('wait.immediate', () => {
  beforeEach(() => openScenario('Already existing and visible', 'immediate'));
  afterEach(home);

  test('immediate reaches exists', async () => {
    expect((await AndroidExp.wait.ui(R.id.api_wait_existing, 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect(R.id.api_wait_existing).toExist();
  });
});

describe('wait.delayed_visible', () => {
  beforeEach(() => openScenario('Hidden target becomes visible', 'delayed_visible'));
  afterEach(home);

  test('show reaches visible', async () => {
    await expect(R.id.api_wait_hidden).toBeHidden();
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).showAfter('api_wait_hidden', 150));
    expect((await AndroidExp.wait.ui(R.id.api_wait_hidden, 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect(R.id.api_wait_hidden).toBeVisible();
  });
});

describe('wait.delayed_gone', () => {
  beforeEach(() => openScenario('Visible target becomes gone', 'delayed_gone'));
  afterEach(home);

  test('hide reaches hidden', async () => {
    await expect(R.id.api_wait_gone).toBeVisible();
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).hideAfter('api_wait_gone', 150));
    expect((await AndroidExp.wait.ui(R.id.api_wait_gone, 'hidden', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect(R.id.api_wait_gone).toBeHidden();
  });
});

describe('wait.attach_detach', () => {
  beforeEach(() => openScenario('Attach and detach a View instance', 'attach_detach'));
  afterEach(home);

  test('attach reaches exists', async () => {
    await expect(R.id.api_wait_attach_target).not.toExist();
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).attachAfter('api_wait_attach_target', 150));
    expect((await AndroidExp.wait.ui(R.id.api_wait_attach_target, 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect(R.id.api_wait_attach_target).toExist();
  });
  test('detach removes the target', async () => {
    await expect(R.id.api_wait_detach_target).toExist();
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).detachAfter('api_wait_detach_target', 150));
    expect((await AndroidExp.wait.until(() => AndroidExp.runOnMainThread(() => AndroidExp.ui.find(R.id.api_wait_detach_target) === null), { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect(R.id.api_wait_detach_target).not.toExist();
  });
});

describe('wait.resize', () => {
  beforeEach(() => openScenario('Zero-size target becomes visible', 'resize'));
  afterEach(home);

  test('resize reaches visible', async () => {
    await expect(R.id.api_wait_zero_size).toBeHidden();
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).resizeAfter('api_wait_zero_size', 150));
    expect((await AndroidExp.wait.ui(R.id.api_wait_zero_size, 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect(R.id.api_wait_zero_size).toBeVisible();
  });
});

describe('wait.timeout', () => {
  beforeEach(() => openScenario('Condition never changes', 'timeout'));
  afterEach(home);

  test('unsatisfied condition returns TIMEOUT', async () => {
    const result = await AndroidExp.wait.ui(timeoutTarget(), 'visible', { timeoutMs: 150, intervalMs: 25 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TIMEOUT');
    await expect(timeoutTarget()).toBeHidden();
  });
  test('until polls a boolean predicate', async () => {
    let checks = 0;
    const result = await AndroidExp.wait.until(() => ++checks === 3, { timeoutMs: 1000, intervalMs: 25 });
    expect(result.ok).toBe(true);
    expect(checks).toBe(3);
  });
});
