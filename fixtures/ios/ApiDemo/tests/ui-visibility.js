import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

const id = name => `api.${name}`;

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

describe('ui.visibility', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.ui')).ok, 'Open ui').toBe(true);
    expect((await IOS.wait.ui('api.ui.scenario.visibility', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.ui.scenario.visibility')).ok, 'Open visibility').toBe(true);
    expect((await IOS.wait.ui('api.ui.ready.visibility', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('hidden and zero-size targets exist but are not visible', async () => {
    for (const target of [id('ui.hidden'), id('ui.zero-size')]) {
      await expect(target).toExist();
      await expect(target).toBeHidden();
      await expect(target).not.toBeVisible();
    }
    await expect(id('ui.visible')).toBeVisible();
  });
});
