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
const missing = () => ['tag::apidemo-tests-missing'];

describe('input.click', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.input')))).ok, 'Open input').toBe(true);
    expect((await AndroidExp.wait.ui(id('input.root'), 'visible')).ok).toBe(true);
    const target = ['text::Click and location targets'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open click').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'click')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('click updates the native counter exactly once', async () => {
    expect((await snapshot()).counter).toBe(0);
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('input.click')))).ok).toBe(true);
    expect((await snapshot()).counter).toBe(1);
  });
  test('second case starts with clean state and supports repeated clicks', async () => {
    expect((await snapshot()).counter).toBe(0);
    for (let index = 0; index < 2; index += 1) {
      expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('input.click')))).ok).toBe(true);
    }
    const counter = (await snapshot()).counter;
    expect(counter).toBe(2);
    expect(counter).toBeGreaterThan(1);
    expect(counter).toBeGreaterThanOrEqual(2);
    expect(counter).toBeLessThan(3);
    expect(counter).toBeLessThanOrEqual(2);
  });
  test('missing input target fails without changing app state', async () => {
    const result = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(missing()));
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VIEW_NOT_FOUND');
    expect((await snapshot()).counter).toBe(0);
  });
});
