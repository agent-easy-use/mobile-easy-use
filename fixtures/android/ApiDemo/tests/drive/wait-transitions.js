import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
import Java from 'frida-java-bridge';
const CONTROLLER = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const timeoutTarget = () => R.id.api_wait_never;
function openScenario(scenario) { return openScene('Wait', scenario, R.id.api_wait_ready); }
describe('wait.immediate', () => {
  beforeEach(() => openScenario('immediate'));
  afterEach(returnHome);

  test('immediate reaches exists', async () => {
    expect((await drive.wait(R.id.api_wait_existing, 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    expect(await inspect.ui.isExisting(R.id.api_wait_existing)).toBe(true);
  });
});

describe('wait.delayed_visible', () => {
  beforeEach(() => openScenario('delayed_visible'));
  afterEach(returnHome);

  test('show reaches visible', async () => {
    expect(await inspect.ui.isHidden(R.id.api_wait_hidden)).toBe(true);
    await common.runOnMainThread(() => Java.use(CONTROLLER).showAfter('api_wait_hidden', 150));
    expect((await drive.wait(R.id.api_wait_hidden, 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    expect(await inspect.ui.isVisible(R.id.api_wait_hidden)).toBe(true);
  });
});

describe('wait.delayed_gone', () => {
  beforeEach(() => openScenario('delayed_gone'));
  afterEach(returnHome);

  test('hide reaches hidden', async () => {
    expect(await inspect.ui.isVisible(R.id.api_wait_gone)).toBe(true);
    await common.runOnMainThread(() => Java.use(CONTROLLER).hideAfter('api_wait_gone', 150));
    expect((await drive.wait(R.id.api_wait_gone, 'hidden', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    expect(await inspect.ui.isHidden(R.id.api_wait_gone)).toBe(true);
  });
});

describe('wait.attach_detach', () => {
  beforeEach(() => openScenario('attach_detach'));
  afterEach(returnHome);

  test('attach reaches exists', async () => {
    expect(await inspect.ui.isExisting(R.id.api_wait_attach_target)).toBe(false);
    await common.runOnMainThread(() => Java.use(CONTROLLER).attachAfter('api_wait_attach_target', 150));
    expect((await drive.wait(R.id.api_wait_attach_target, 'exists', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    expect(await inspect.ui.isExisting(R.id.api_wait_attach_target)).toBe(true);
  });
  test('detach removes the target', async () => {
    expect(await inspect.ui.isExisting(R.id.api_wait_detach_target)).toBe(true);
    await common.runOnMainThread(() => Java.use(CONTROLLER).detachAfter('api_wait_detach_target', 150));
    expect((await drive.waitUntil(async () => (await element.findUiView(R.id.api_wait_detach_target)) === null, { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    expect(await inspect.ui.isExisting(R.id.api_wait_detach_target)).toBe(false);
  });
});

describe('wait.resize', () => {
  beforeEach(() => openScenario('resize'));
  afterEach(returnHome);

  test('resize reaches visible', async () => {
    expect(await inspect.ui.isHidden(R.id.api_wait_zero_size)).toBe(true);
    await common.runOnMainThread(() => Java.use(CONTROLLER).resizeAfter('api_wait_zero_size', 150));
    expect((await drive.wait(R.id.api_wait_zero_size, 'visible', { timeoutMs: 2000, intervalMs: 25 })).ok).toBe(true);
    expect(await inspect.ui.isVisible(R.id.api_wait_zero_size)).toBe(true);
  });
});

describe('wait.timeout', () => {
  beforeEach(() => openScenario('timeout'));
  afterEach(returnHome);

  test('unsatisfied condition returns TIMEOUT', async () => {
    const result = await drive.wait(timeoutTarget(), 'visible', { timeoutMs: 150, intervalMs: 25 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TIMEOUT');
    expect(await inspect.ui.isHidden(timeoutTarget())).toBe(true);
  });
  test('until polls a boolean predicate', async () => {
    let checks = 0;
    const result = await drive.waitUntil(() => ++checks === 3, { timeoutMs: 1000, intervalMs: 25 });
    expect(result.ok).toBe(true);
    expect(checks).toBe(3);
  });
});
