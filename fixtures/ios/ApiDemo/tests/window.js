import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

describe('input.windows', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.windows', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.windows')).ok, 'Open windows').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.windows', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  for (const mode of ['same', 'hidden', 'top']) {
    test(`window ${mode} routes or rejects the touch`, async () => {
      await IOS.runOnMainThread(() => ObjC.classes.APIController.configureInputWindow_(mode));
      const target = await IOS.runOnMainThread(() => ObjC.classes.APIController.inputWindowTarget_front_('click', mode === 'top'));
      const result = await IOS.input.click(target);
      if (mode === 'same') {
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('TOUCH_TARGET_MISMATCH');
      } else {
        expect(result.ok).toBe(true);
      }
      const state = JSON.parse(await IOS.runOnMainThread(() => String(ObjC.classes.APIController.inputWindowSnapshotJSON())));
      expect({ base: state.baseClicks, front: state.frontClicks })
        .toEqual({ base: mode === 'hidden' ? 1 : 0, front: mode === 'top' ? 1 : 0 });
    });
  }
});
