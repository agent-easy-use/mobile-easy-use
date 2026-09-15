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

async function snapshot() {
  const state = await inspectPageState();
  return { ...state, counter: state.clickCount, text: state.inputText };
}
const classPath = () => [`id::${id('ui.class.scope')}`, 'class::android.widget.Button'];
const targetText = view => String(view.getText());

describe('ui.class', () => {
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

  test('class path clicks first descendant and preserves sibling', async () => {
    await expect(classPath()).toBeVisible();
    await expect(classPath()).toBeEnabled();
    await expect(classPath()).toSatisfy(view => targetText(view) === 'FIRST');
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(classPath()))).ok).toBe(true);
    expect((await snapshot()).counter).toBe(1);
    await expect(id('ui.class.first')).toSatisfy(view => targetText(view) === 'FIRST:1');
    await expect(id('ui.class.second')).toSatisfy(view => targetText(view) === 'SECOND');
  });
});
