import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

const path = () => ['identifier::api.ui.nested.parent', 'label::API_FIXED_LABEL'];
const hasNestedId = view => String(view.accessibilityIdentifier()) === 'api.ui.nested.child';
const missing = () => 'api.tests.missing';

describe('ui.path', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.ui')).ok, 'Open ui').toBe(true);
    expect((await IOS.wait.ui('api.ui.scenario.path', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.ui.scenario.path')).ok, 'Open path').toBe(true);
    expect((await IOS.wait.ui('api.ui.ready.path', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('descendant path resolves the expected native child', async () => {
    await expect(path()).toExist();
    await expect(path()).toSatisfy(hasNestedId);
    await expect(missing()).not.toExist();
    await expect(missing()).not.toBeHidden(); // Missing is different from hidden.
  });
});
