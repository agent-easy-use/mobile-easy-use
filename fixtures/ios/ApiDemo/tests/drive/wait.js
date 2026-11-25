const { runOnMainThread } = common;
// Synchronous native lookup for scene setup/readback inside main-thread callbacks.
import { findUiView } from '../../../../../sdk/ios/element/query.js';
import { openScene, returnHome } from './helpers/input-scene.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
describe('drive.wait', () => {
  beforeEach(() => openScene('click', 'api.input.click'));
  afterEach(returnHome);
  test('wait observes an asynchronous native state change', async () => {
    const target = 'api.input.click';
    await runOnMainThread(() => findUiView(target).setEnabled_(false));
    let change;
    const timer = setTimeout(() => {
      change = runOnMainThread(() => findUiView(target).setEnabled_(true));
    }, 100);
    try {
      const result = await drive.wait(target, 'enabled', { timeoutMs: 2000, intervalMs: 20 });
      expect(result.ok, 'Wait observes the enabled control').toBe(true);
    } finally {
      clearTimeout(timer);
      if (change) await change;
    }
  });
  test('missing target times out and a later valid wait still succeeds', async () => {
    const result = await drive.wait("p0.missing", 'exists', { timeoutMs: 120, intervalMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TIMEOUT');
    expect((await drive.wait('api.input.click', 'visible')).ok).toBe(true);
  });
  test('waitUntil awaits asynchronous predicates and reports timeout', async () => {
    let attempts = 0;
    const ready = await drive.waitUntil(async () => {
      await runOnMainThread(() => findUiView('api.input.click'));
      attempts += 1;
      return attempts === 3;
    }, { timeoutMs: 2000, intervalMs: 20 });
    expect(ready.ok).toBe(true);
    expect(attempts).toBe(3);
    const timeout = await drive.waitUntil(() => false, { timeoutMs: 100, intervalMs: 20 });
    expect(timeout.ok).toBe(false);
    expect(timeout.error.code).toBe('TIMEOUT');
  });
});
