import Java from 'frida-java-bridge';
import { openScene, returnHome } from './helpers/input-scene.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const state = () => Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState').getInstance();
describe('drive native input boundaries', () => {
  afterEach(returnHome);
  test('hidden, zero-size and detached targets reject clicks without native events', async () => {
    await openScene('target_errors', R.id.api_input_ready);
    const detached = await common.runOnMainThread(() =>
      Java.use('com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController').getDetachedView());
    for (const target of [R.id.api_input_hidden, R.id.api_input_zero_size, detached]) {
      const result = await drive.click(target);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('VIEW_NOT_VISIBLE');
    }
    const native = await common.runOnMainThread(() => ({
      clicks: Number(state().getClickCount()), events: Number(state().getInputEvents().size()),
    }));
    expect(native).toEqual({ clicks: 0, events: 0 });
  });
  test('long press delivers a held DOWN/UP pair without a short click', async () => {
    await openScene('long_press', R.id.api_input_long_press);
    const result = await drive.longPress(R.id.api_input_long_press);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const native = await common.runOnMainThread(() => {
      const Event = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.input.RecordedInputEvent');
      const events = Array.from(state().getInputEvents().toArray()).map(raw => {
        const event = Java.cast(raw, Event);
        return { action: Number(event.action.value), down: Number(event.downTime.value), time: Number(event.eventTime.value) };
      });
      return { events, clicks: Number(state().getClickCount()), presses: Number(state().getLongPressCount()) };
    });
    expect(native.events.map(event => event.action)).toEqual([0, 1]); // ACTION_DOWN, ACTION_UP
    expect(native.events[1].time - native.events[0].down).toBeGreaterThanOrEqual(500);
    expect(native.clicks).toBe(0);
    expect(native.presses).toBe(1);
  });
});
