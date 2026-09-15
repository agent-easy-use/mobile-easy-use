import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

const timeoutTarget = () => 'api.wait.timeout';

async function openScenario(scenario) {
  await home();
  expect((await IOS.input.click('api.menu.wait')).ok, 'Open wait').toBe(true);
  expect((await IOS.wait.ui(`api.wait.scenario.${scenario}`, 'visible')).ok).toBe(true);
  expect((await IOS.input.click(`api.wait.scenario.${scenario}`)).ok, `Open ${scenario}`).toBe(true);
  expect((await IOS.wait.ui(`api.wait.ready.${scenario}`, 'visible')).ok, 'Scenario ready').toBe(true);
}

describe('wait.immediate', () => {
  beforeEach(() => openScenario('immediate'));
  afterEach(home);

  test('immediate reaches exists', async () => {
    expect((await IOS.wait.ui('api.wait.immediate', 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.immediate').toExist();
  });
});

describe('wait.delayed_visible', () => {
  beforeEach(() => openScenario('delayed_visible'));
  afterEach(home);

  test('show reaches visible', async () => {
    await expect('api.wait.delayed-visible').toBeHidden();
    await IOS.runOnMainThread(() => ObjC.classes.APIController.showAfter_delayMs_('delayed-visible', 150));
    expect((await IOS.wait.ui('api.wait.delayed-visible', 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.delayed-visible').toBeVisible();
  });
});

describe('wait.delayed_gone', () => {
  beforeEach(() => openScenario('delayed_gone'));
  afterEach(home);

  test('hide reaches hidden', async () => {
    await expect('api.wait.delayed-gone').toBeVisible();
    await IOS.runOnMainThread(() => ObjC.classes.APIController.hideAfter_delayMs_('delayed-gone', 150));
    expect((await IOS.wait.ui('api.wait.delayed-gone', 'hidden', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.delayed-gone').toBeHidden();
  });
});

describe('wait.attach_detach', () => {
  beforeEach(() => openScenario('attach_detach'));
  afterEach(home);

  test('attach reaches exists', async () => {
    await expect('api.wait.attach-target').not.toExist();
    await IOS.runOnMainThread(() => ObjC.classes.APIController.attachAfter_delayMs_('attach-target', 150));
    expect((await IOS.wait.ui('api.wait.attach-target', 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.attach-target').toExist();
  });
  test('detach removes the target', async () => {
    await expect('api.wait.detach-target').toExist();
    await IOS.runOnMainThread(() => ObjC.classes.APIController.detachAfter_delayMs_('detach-target', 150));
    expect((await IOS.wait.until(() => IOS.runOnMainThread(() => IOS.ui.find('api.wait.detach-target') === null), { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.detach-target').not.toExist();
  });
});

describe('wait.resize', () => {
  beforeEach(() => openScenario('resize'));
  afterEach(home);

  test('resize reaches visible', async () => {
    await expect('api.wait.resize').toBeHidden();
    await IOS.runOnMainThread(() => ObjC.classes.APIController.resizeAfter_delayMs_('resize', 150));
    expect((await IOS.wait.ui('api.wait.resize', 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.resize').toBeVisible();
  });
});

describe('wait.timeout', () => {
  beforeEach(() => openScenario('timeout'));
  afterEach(home);

  test('unsatisfied condition returns TIMEOUT', async () => {
    const result = await IOS.wait.ui(timeoutTarget(), 'visible', { timeoutMs: 150, intervalMs: 25 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TIMEOUT');
    await expect(timeoutTarget()).toBeHidden();
  });
  test('until polls a boolean predicate', async () => {
    let checks = 0;
    const result = await IOS.wait.until(() => ++checks === 3, { timeoutMs: 1000, intervalMs: 25 });
    expect(result.ok).toBe(true);
    expect(checks).toBe(3);
  });
});
