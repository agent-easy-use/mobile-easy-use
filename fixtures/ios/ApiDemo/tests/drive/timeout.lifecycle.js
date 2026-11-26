import ObjC from 'frida-objc-bridge';
import { requestController } from '../../../../../sdk/common/controller.js';
import { prepareInputCommand } from '../../../../../sdk/ios/drive/input/input-target.js';
import { openScene, returnHome, readLongPressCount } from './helpers/input-scene.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
// Lifecycle orchestration unloads the SDK and closes the poisoned Runner between
// arm() and run(). This case therefore does not depend on suite ordering.
export function pid() { return Process.id; }
export async function arm() {
  await openScene('long_press', 'api.input.long-press');
  try {
    // Warm up the real Runner before starting the short deadline. The event lasts
    // longer than its deadline, so timeout occurs with native work still in flight.
    const warm = await drive.longPress('api.input.long-press');
    expect(warm.ok, JSON.stringify(warm)).toBe(true);
    const before = await readLongPressCount();
    const command = await common.runOnMainThread(() => prepareInputCommand(
      'longPress', 'api.input.long-press', { duration: 2000 }));
    command.expiresAt = Date.now() + 300;
    const timedOut = await requestController('ios.input.perform', { command }, 10000);
    expect(timedOut.ok, 'Controller request completes').toBe(true);
    expect(timedOut.responsePayload.ok).toBe(false);
    expect(timedOut.responsePayload.error.code).toBe('SYNTHESIS_UNCERTAIN');
    command.expiresAt = Date.now() + 10000;
    const retry = await requestController('ios.input.perform', { command }, 10000);
    expect(retry.ok, 'Controller request completes').toBe(true);
    expect(retry.responsePayload.ok).toBe(false);
    expect(retry.responsePayload.error.code).toBe('SYNTHESIS_UNCERTAIN');
    const began = await drive.waitUntil(async () => (await readLongPressCount()) === before + 1);
    expect(began.ok, 'Timed-out native event still reaches the gesture handler').toBe(true);
    const view = await element.findUiView('api.input.long-press');
    const ended = await drive.waitUntil(() => common.runOnMainThread(() => {
      const gestures = view.gestureRecognizers();
      for (let i = 0; i < Number(gestures.count()); i++) {
        if (Number(gestures.objectAtIndex_(i).state()) !== 0) return false;
      }
      return true;
    }));
    expect(ended.ok, 'Native gesture returns to its idle state').toBe(true);
    command.expiresAt = Date.now() + 10000;
    const afterCompletion = await requestController('ios.input.perform', { command }, 10000);
    expect(afterCompletion.ok, 'Controller request completes').toBe(true);
    expect(afterCompletion.responsePayload.ok).toBe(false);
    expect(afterCompletion.responsePayload.error.code).toBe('SYNTHESIS_UNCERTAIN');
    expect(await readLongPressCount()).toBe(before + 1);
    return { armed: true, pid: Process.id };
  } finally { await returnHome(); }
}
describe('native input completion timeout', () => {
  beforeEach(async () => { await openScene('long_press', 'api.input.long-press'); });
  afterEach(returnHome);
  test('closing the uncertain Runner permits a fresh session to perform one native gesture', async () => {
    const before = await readLongPressCount();
    const result = await drive.longPress('api.input.long-press');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await readLongPressCount()).toBe(before + 1);
  });
});
