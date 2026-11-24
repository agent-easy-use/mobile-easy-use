import Java from 'frida-java-bridge';
import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const controller = () => Java.use('com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController');
describe('focused window queries', () => {
  afterEach(returnHome);
  for (const kind of ['dialog', 'popup_focusable']) {
    test(`${kind} supplies the query root and closing restores the activity`, async () => {
      await openScene('Window', kind, R.id.api_window_activity_target);
      const target = kind === 'dialog' ? R.id.api_window_dialog_target : R.id.api_window_popup_target;
      try {
        await common.runOnMainThread(() => {
          if (kind === 'dialog') controller().openDialog();
          else controller().openPopup(true);
        });
        const ready = await drive.wait(target, 'visible');
        expect(ready.ok, 'Overlay is visible').toBe(true);
        const view = await element.findUiView(target);
        expect(await common.runOnMainThread(() => Number(view.getId()))).toBe(target);
        expect(await common.runOnMainThread(() => Boolean(view.hasWindowFocus()))).toBe(true);
      } finally {
        await common.runOnMainThread(() => controller().closeWindows());
      }
      expect((await drive.wait(R.id.api_window_activity_target, 'visible')).ok).toBe(true);
      expect(await element.findUiView(target)).toBe(null);
    });
  }
  test('a non-focusable popup leaves activity queries in the focused window', async () => {
    await openScene('Window', 'popup_nonfocusable', R.id.api_window_activity_target);
    try {
      await common.runOnMainThread(() => controller().openPopup(false));
      expect(await common.runOnMainThread(() => Boolean(Java.use(
        'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState').getInstance().isPopupOpen()))).toBe(true);
      const activity = await element.findUiView(R.id.api_window_activity_target);
      expect(activity !== null).toBe(true);
      expect(await common.runOnMainThread(() => Boolean(activity.hasWindowFocus()))).toBe(true);
      expect(await element.findUiView(R.id.api_window_popup_target)).toBe(null);
    } finally {
      await common.runOnMainThread(() => controller().closeWindows());
    }
  });

  test('background windows are not used as query roots', async () => {
    await openScene('Window', 'no_focused_window', R.id.api_window_activity_target);
    const view = await element.findUiView(R.id.api_window_activity_target);
    try {
      await common.runOnMainThread(() => controller().moveTaskToBack());
      const unfocused = await drive.waitUntil(() => common.runOnMainThread(() => !view.hasWindowFocus()));
      expect(unfocused.ok, 'Native activity loses window focus').toBe(true);
      expect(await element.findUiView(R.id.api_window_activity_target)).toBe(null);
    } finally {
      await openScene('Window', 'no_focused_window', R.id.api_window_activity_target);
    }
  });

});
