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

describe('ui.visibility', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.ui')))).ok, 'Open ui').toBe(true);
    expect((await AndroidExp.wait.ui(id('ui.root'), 'visible')).ok).toBe(true);
    const target = ['text::Hidden, gone, disabled and zero-size Views'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open visibility').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'visibility')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('hidden and zero-size targets exist but are not visible', async () => {
    for (const target of [id('ui.hidden'), id('ui.zero_size')]) {
      await expect(target).toExist();
      await expect(target).toBeHidden();
      await expect(target).not.toBeVisible();
    }
    await expect(id('ui.disabled')).not.toBeEnabled();
  });
});
