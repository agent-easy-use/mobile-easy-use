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

async function snapshot() {
  return JSON.parse(await IOS.runOnMainThread(() => String(ObjC.classes.APIController.snapshotJSON())));
}
const classPath = () => ['identifier::api.ui.class.scope', 'class::UIButton'];
const targetText = view => String(view.currentTitle());

describe('ui.class', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.ui')).ok, 'Open ui').toBe(true);
    expect((await IOS.wait.ui('api.ui.scenario.class', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.ui.scenario.class')).ok, 'Open class').toBe(true);
    expect((await IOS.wait.ui('api.ui.ready.class', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('class path clicks first descendant and preserves sibling', async () => {
    await expect(classPath()).toBeVisible();
    await expect(classPath()).toBeEnabled();
    await expect(classPath()).toSatisfy(view => targetText(view) === 'FIRST');
    expect((await IOS.input.click(classPath())).ok).toBe(true);
    expect((await snapshot()).counter).toBe(1);
    await expect(id('ui.class.first')).toSatisfy(view => targetText(view) === 'FIRST:1');
    await expect(id('ui.class.second')).toSatisfy(view => targetText(view) === 'SECOND');
  });
});
