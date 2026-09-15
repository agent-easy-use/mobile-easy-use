import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

async function snapshot() {
  return JSON.parse(await IOS.runOnMainThread(() => String(ObjC.classes.APIController.snapshotJSON())));
}

describe('input.vertical_scroll', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.vertical_scroll', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.vertical_scroll')).ok, 'Open vertical_scroll').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.vertical_scroll', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('gesture moves native scroll offset', async () => {
    const before = (await snapshot()).scrollY;
    expect((await IOS.input.scroll('api.input.vertical-scroll', 'up', 150)).ok).toBe(true);
    expect((await IOS.wait.until(async () => (await snapshot()).scrollY > before)).ok).toBe(true);
    expect((await snapshot()).scrollY).toBeGreaterThan(before);
  });
});

describe('input.horizontal_scroll', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.horizontal_scroll', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.horizontal_scroll')).ok, 'Open horizontal_scroll').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.horizontal_scroll', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('gesture moves native scroll offset', async () => {
    const before = (await snapshot()).scrollX;
    expect((await IOS.input.scroll('api.input.horizontal-scroll', 'left', 150)).ok).toBe(true);
    expect((await IOS.wait.until(async () => (await snapshot()).scrollX > before)).ok).toBe(true);
    expect((await snapshot()).scrollX).toBeGreaterThan(before);
  });
});
