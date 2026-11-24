import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
import ObjC from 'frida-objc-bridge';
const timeoutTarget = () => 'api.wait.timeout';
function openScenario(scenario) { return openScene('Wait', scenario, `api.wait.ready.${scenario}`); }
describe('wait.immediate', () => {
  beforeEach(() => openScenario('immediate'));
  afterEach(returnHome);

  test('immediate reaches exists', async () => {
    expect((await drive.wait('api.wait.immediate', 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.immediate').toExist();
  });
});

describe('wait.delayed_visible', () => {
  beforeEach(() => openScenario('delayed_visible'));
  afterEach(returnHome);

  test('show reaches visible', async () => {
    await expect('api.wait.delayed-visible').toBeHidden();
    await common.runOnMainThread(() => ObjC.classes.APIController.showAfter_delayMs_('delayed-visible', 150));
    expect((await drive.wait('api.wait.delayed-visible', 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.delayed-visible').toBeVisible();
  });
});

describe('wait.delayed_gone', () => {
  beforeEach(() => openScenario('delayed_gone'));
  afterEach(returnHome);

  test('hide reaches hidden', async () => {
    await expect('api.wait.delayed-gone').toBeVisible();
    await common.runOnMainThread(() => ObjC.classes.APIController.hideAfter_delayMs_('delayed-gone', 150));
    expect((await drive.wait('api.wait.delayed-gone', 'hidden', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.delayed-gone').toBeHidden();
  });
});

describe('wait.attach_detach', () => {
  beforeEach(() => openScenario('attach_detach'));
  afterEach(returnHome);

  test('attach reaches exists', async () => {
    await expect('api.wait.attach-target').not.toExist();
    await common.runOnMainThread(() => ObjC.classes.APIController.attachAfter_delayMs_('attach-target', 150));
    expect((await drive.wait('api.wait.attach-target', 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.attach-target').toExist();
  });
  test('detach removes the target', async () => {
    await expect('api.wait.detach-target').toExist();
    await common.runOnMainThread(() => ObjC.classes.APIController.detachAfter_delayMs_('detach-target', 150));
    expect((await drive.waitUntil(async () => (await element.findUiView('api.wait.detach-target')) === null, { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.detach-target').not.toExist();
  });
});

describe('wait.resize', () => {
  beforeEach(() => openScenario('resize'));
  afterEach(returnHome);

  test('resize reaches visible', async () => {
    await expect('api.wait.resize').toBeHidden();
    await common.runOnMainThread(() => ObjC.classes.APIController.resizeAfter_delayMs_('resize', 150));
    expect((await drive.wait('api.wait.resize', 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    await expect('api.wait.resize').toBeVisible();
  });
});

describe('wait.timeout', () => {
  beforeEach(() => openScenario('timeout'));
  afterEach(returnHome);

  test('unsatisfied condition returns TIMEOUT', async () => {
    const result = await drive.wait(timeoutTarget(), 'visible', { timeoutMs: 150, intervalMs: 25 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TIMEOUT');
    await expect(timeoutTarget()).toBeHidden();
  });
  test('until polls a boolean predicate', async () => {
    let checks = 0;
    const result = await drive.waitUntil(() => ++checks === 3, { timeoutMs: 1000, intervalMs: 25 });
    expect(result.ok).toBe(true);
    expect(checks).toBe(3);
  });
});
