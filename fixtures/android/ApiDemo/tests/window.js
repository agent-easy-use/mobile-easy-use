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

describe('window.dialog', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.window')))).ok, 'Open window').toBe(true);
    expect((await AndroidExp.wait.ui(id('window.root'), 'visible')).ok).toBe(true);
    const target = ['text::Dialog Window root'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open dialog').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'dialog')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('focused overlay becomes query root and closes cleanly', async () => {
    const before = await AndroidExp.runOnMainThread(() => AndroidExp.window.getRootViews().length);
    try {
      expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(R.id.api_window_dialog))).ok).toBe(true);
      expect((await AndroidExp.wait.ui(R.id.api_window_dialog_target, 'visible')).ok).toBe(true);
      expect((await inspectPageState()).dialogOpen).toBe(true);
      const roots = await AndroidExp.runOnMainThread(() => {
        const views = AndroidExp.window.getRootViews();
        return { count: views.length, focused: views.filter(view => view.hasWindowFocus()).length };
      });
      expect(roots.count).toBeGreaterThan(before);
      expect(roots.focused).toBe(1);
    } finally {
      await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).closeWindows());
    }
    expect((await AndroidExp.wait.ui(R.id.api_window_activity_target, 'visible')).ok).toBe(true);
    expect((await inspectPageState()).dialogOpen).toBe(false);
  });
});

describe('window.popup_focusable', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.window')))).ok, 'Open window').toBe(true);
    expect((await AndroidExp.wait.ui(id('window.root'), 'visible')).ok).toBe(true);
    const target = ['text::Focusable PopupWindow root'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open popup_focusable').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'popup_focusable')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('focused overlay becomes query root and closes cleanly', async () => {
    const before = await AndroidExp.runOnMainThread(() => AndroidExp.window.getRootViews().length);
    try {
      expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(R.id.api_window_popup))).ok).toBe(true);
      expect((await AndroidExp.wait.ui(R.id.api_window_popup_target, 'visible')).ok).toBe(true);
      expect((await inspectPageState()).popupOpen).toBe(true);
      const roots = await AndroidExp.runOnMainThread(() => {
        const views = AndroidExp.window.getRootViews();
        return { count: views.length, focused: views.filter(view => view.hasWindowFocus()).length };
      });
      expect(roots.count).toBeGreaterThan(before);
      expect(roots.focused).toBe(1);
    } finally {
      await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).closeWindows());
    }
    expect((await AndroidExp.wait.ui(R.id.api_window_activity_target, 'visible')).ok).toBe(true);
    expect((await inspectPageState()).popupOpen).toBe(false);
  });
});
