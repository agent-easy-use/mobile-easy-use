import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

// Absolute Host path; update when moving the checkout. See baselines/README.md for device configuration.
const BASELINE = '/Users/bytedance/IdeaProjects/mobile-easy-use/fixtures/ios/ApiDemo/tests/baselines/class-first.jpg';

describe('screenshot', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.ui')).ok, 'Open ui').toBe(true);
    expect((await IOS.wait.ui('api.ui.scenario.class', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.ui.scenario.class')).ok, 'Open class').toBe(true);
    expect((await IOS.wait.ui('api.ui.ready.class', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('FIRST matches the reviewed baseline', async () => {
    await expect('api.ui.class.first').toSatisfy(view => String(view.currentTitle()) === 'FIRST');
    expect((await inspectPageState()).counter).toBe(0);
    await expect('api.ui.class.first').toHaveElementScreenShot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
