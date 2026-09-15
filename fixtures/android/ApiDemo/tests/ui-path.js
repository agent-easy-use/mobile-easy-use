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

const path = () => [`id::${id('ui.nested.parent')}`, 'tag::api-nested-child'];
const hasNestedId = view => Number(view.getId()) === id('ui.nested.child');
const missing = () => ['tag::apidemo-tests-missing'];

describe('ui.path', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.ui')))).ok, 'Open ui').toBe(true);
    expect((await AndroidExp.wait.ui(id('ui.root'), 'visible')).ok).toBe(true);
    const target = ['text::ID, text, tag and descendant path'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open path').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'path')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('descendant path resolves the expected native child', async () => {
    await expect(path()).toExist();
    await expect(path()).toSatisfy(hasNestedId);
    await expect(missing()).not.toExist();
    await expect(missing()).not.toBeHidden(); // Missing is different from hidden.
  });
});
