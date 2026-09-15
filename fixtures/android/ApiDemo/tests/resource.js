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

describe('resource.resolve', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.resource')))).ok, 'Open resource').toBe(true);
    expect((await AndroidExp.wait.ui(id('resource.root'), 'visible')).ok).toBe(true);
    const target = ['text::Resolve ID and string'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open resolve').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'resolve')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('dynamic IDs match compiled App resources', () => Java.performNow(() => {
    expect(R.id.api_resource_id_target).toBe(Number(Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$id').api_resource_id_target.value));
    expect(R.string.api_resource_string).toBe(Number(Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$string').api_resource_string.value));
    expect(R.id.api_resource_id_target).toBeGreaterThan(0);
  }));
});

describe('resource.missing', () => {
  beforeEach(async () => {
    await home();
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(id('menu.resource')))).ok, 'Open resource').toBe(true);
    expect((await AndroidExp.wait.ui(id('resource.root'), 'visible')).ok).toBe(true);
    const target = ['text::Missing resource returns zero'];
    await expect(target).toExist();
    await AndroidExp.runOnMainThread(() => {
      const view = AndroidExp.ui.find(target);
      const rect = Java.use('android.graphics.Rect').$new();
      view.getDrawingRect(rect);
      view.requestRectangleOnScreen(rect, true);
    });
    expect((await AndroidExp.runOnMainThread(() => AndroidExp.input.click(target))).ok, 'Open missing').toBe(true);
    expect((await AndroidExp.wait.until(async () => (await inspectPageState()).scenario === 'missing')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('missing resource does not poison later lookups', () => Java.performNow(() => {
    expect(R.id.api_resource_missing).toBe(0);
    expect(R.id.api_resource_id_target).toBe(Number(Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$id').api_resource_id_target.value));
  }));
});
