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

// Absolute Host path; update when moving the checkout. See baselines/README.md for device configuration.
const BASELINE = '/Users/bytedance/IdeaProjects/mobile-easy-use/fixtures/android/ApiDemo/tests/baselines/class-first.jpg';

describe('screenshot', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.ui')))).ok, 'Open ui').toBe(true);
    expect((await AndroidExp.wait.ui(id('ui.root'), 'visible')).ok).toBe(true);
    const target = ['text::Class names and subclasses'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open class').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'class')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('FIRST matches the reviewed baseline', async () => {
    await expect(R.id.api_ui_class_first).toSatisfy(view => String(view.getText()) === 'FIRST');
    expect((await inspectPageState()).clickCount).toBe(0);
    await expect(R.id.api_ui_class_first).toHaveElementScreenShot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
