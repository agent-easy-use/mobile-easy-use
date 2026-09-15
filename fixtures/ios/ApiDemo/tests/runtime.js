import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

describe('runtime', () => {
  beforeEach(async () => {
    await home();
  });
  afterEach(home);

  test('runtime identity', () => {
    const status = runtimeStatus();
    expect({ platform: status.platform, available: status.available, appId: status.appId })
      .toEqual({ platform: 'ios', available: true, appId: 'com.agenteasyuse.mobileeasyuse.apidemo.ios' });
    expect(status.appId).toMatch(/^com\.agenteasyuse\.mobileeasyuse\.apidemo/);
    expect(status.appId).toContain('apidemo');
  });
});
