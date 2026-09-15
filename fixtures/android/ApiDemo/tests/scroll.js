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

describe('input.vertical_scroll', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.input')))).ok, 'Open input').toBe(true);
    expect((await AndroidExp.wait.ui(id('input.root'), 'visible')).ok).toBe(true);
    const target = ['text::Vertical ScrollView gesture'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open vertical_scroll').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'vertical_scroll')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('gesture moves native scroll offset', async () => {
    const before = (await snapshot()).scrollY;
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.scroll(id('input.vertical_scroll'), 'up', 150))).ok).toBe(true);
    expect((await AndroidExp.wait.until(async () => (await snapshot()).scrollY > before)).ok).toBe(true);
    expect((await snapshot()).scrollY).toBeGreaterThan(before);
  });
});

describe('input.horizontal_scroll', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.input')))).ok, 'Open input').toBe(true);
    expect((await AndroidExp.wait.ui(id('input.root'), 'visible')).ok).toBe(true);
    const target = ['text::Horizontal ScrollView gesture'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open horizontal_scroll').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'horizontal_scroll')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('gesture moves native scroll offset', async () => {
    const before = (await snapshot()).scrollX;
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.scroll(id('input.horizontal_scroll'), 'left', 150))).ok).toBe(true);
    expect((await AndroidExp.wait.until(async () => (await snapshot()).scrollX > before)).ok).toBe(true);
    expect((await snapshot()).scrollX).toBeGreaterThan(before);
  });
});
