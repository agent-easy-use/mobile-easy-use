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

describe('input.text', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.input')))).ok, 'Open input').toBe(true);
    expect((await AndroidExp.wait.ui(id('input.root'), 'visible')).ok).toBe(true);
    const target = ['text::KeyCharacterMap text input'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open text').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'text_input')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('text input focuses field and changes native text', async () => {
    const text = 'ApiDemo test 123';
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.input(id('input.text'), text))).ok).toBe(true);
    await expect(id('input.text')).toBeFocused();
    expect((await snapshot()).text).toBe(text);
  });
});
