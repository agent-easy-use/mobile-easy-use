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

describe('input.long_press', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.long_press', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.long_press')).ok, 'Open long_press').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.long_press', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('long press invokes native handler', async () => {
    expect((await IOS.input.longPress(id('input.long-press'))).ok).toBe(true);
    expect((await snapshot()).activationCount).toBe(1);
  });
});
