import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

const CONTROLLER = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';

async function home() {
  if (!(await inspectPageState()).homeVisible) {
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).returnToMain());
  }
  expect((await AndroidExp.wait.ui(R.id.api_menu_input, 'visible')).ok, 'Main ready').toBe(true);
}

// Absolute Host path; see baselines/README.md for the reviewed device configuration.
const BASELINE = '/Users/bytedance/IdeaProjects/mobile-easy-use/fixtures/android/ApiDemo/tests/baselines/home-window.jpg';

describe('window screenshot', () => {
  beforeEach(home);
  afterEach(home);

  test('home window matches the reviewed baseline', async () => {
    await expect(R.id.api_menu_ui).toBeVisible();
    await expect().toHaveWindowScreenShot(BASELINE, { maxDiffPixelRatio: 0 });
  });

  test('opening UI changes the window appearance', async () => {
    const opened = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(R.id.api_menu_ui));
    expect(opened.ok, `Open UI: ${JSON.stringify(opened)}`).toBe(true);
    expect((await AndroidExp.wait.ui(R.id.api_ui_root, 'visible')).ok, 'UI ready').toBe(true);
    await expect().not.toHaveWindowScreenShot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
