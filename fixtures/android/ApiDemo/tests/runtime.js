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

describe('runtime', () => {
  beforeEach(async () => {
    await home();
  });
  afterEach(home);

  test('runtime identity', () => {
    const status = runtimeStatus();
    expect({ platform: status.platform, available: status.available, appId: status.appId })
      .toEqual({ platform: 'android', available: true, appId: 'com.agenteasyuse.mobileeasyuse.apidemo' });
    expect(status.appId).toMatch(/^com\.agenteasyuse\.mobileeasyuse\.apidemo/);
    expect(status.appId).toContain('apidemo');
  });
});
