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

async function overrideObservation(fail) {
  const name = 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState';
  const call = text => {
    let value;
    Java.performNow(() => { value = String(Java.use(name).getInstance().single(text)); });
    return value;
  };
  const sentinel = new Error('expected action failure');
  let inside, caught;
  try {
    inside = await Override.run([{ target: name, method: 'single',
      argumentTypes: ['java.lang.String'], withReturn: 'test-replacement' }], async () => {
      await Promise.resolve();
      const value = call('inside');
      expect(value).toBe('test-replacement');
      if (fail) throw sentinel;
      return value;
    });
  } catch (error) { caught = error; }
  return { inside, caught, sentinel, outside: call('outside') };
}

describe('override', () => {
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

  test('async method override restores native implementation', async () => {
    const result = await overrideObservation(false);
    expect(result.caught).toBe(undefined);
    expect(result.inside).toBe('test-replacement');
    expect(result.outside).toBe('single:outside');
  });
  test('action rejection also restores native implementation', async () => {
    const result = await overrideObservation(true);
    expect(result.caught).toBe(result.sentinel);
    expect(result.outside).toBe('single:outside');
  });
});
