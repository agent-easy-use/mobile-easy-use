import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

// Absolute Host path; see baselines/README.md for the reviewed device configuration.
const BASELINE = '/Users/bytedance/IdeaProjects/mobile-easy-use/fixtures/ios/ApiDemo/tests/baselines/home-window.jpg';

describe('window screenshot', () => {
  beforeEach(home);
  afterEach(home);

  test('home window matches the reviewed baseline', async () => {
    await expect('api.menu.ui').toBeVisible();
    await expect().toHaveWindowScreenShot(BASELINE, { maxDiffPixelRatio: 0 });
  });

  test('opening UI changes the window appearance', async () => {
    const opened = await IOS.input.click('api.menu.ui');
    expect(opened.ok, `Open UI: ${JSON.stringify(opened)}`).toBe(true);
    expect((await IOS.wait.ui('api.ui.root', 'visible')).ok, 'UI ready').toBe(true);
    await expect().not.toHaveWindowScreenShot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
