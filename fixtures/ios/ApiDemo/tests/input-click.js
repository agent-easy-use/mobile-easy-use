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
const missing = () => 'api.tests.missing';

describe('input.click', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.click', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.click')).ok, 'Open click').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.click', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('click updates the native counter exactly once', async () => {
    expect((await snapshot()).counter).toBe(0);
    expect((await IOS.input.click(id('input.click'))).ok).toBe(true);
    expect((await snapshot()).counter).toBe(1);
  });
  test('second case starts with clean state and supports repeated clicks', async () => {
    expect((await snapshot()).counter).toBe(0);
    for (let index = 0; index < 2; index += 1) {
      expect((await IOS.input.click(id('input.click'))).ok).toBe(true);
    }
    const counter = (await snapshot()).counter;
    expect(counter).toBe(2);
    expect(counter).toBeGreaterThan(1);
    expect(counter).toBeGreaterThanOrEqual(2);
    expect(counter).toBeLessThan(3);
    expect(counter).toBeLessThanOrEqual(2);
  });
  test('missing input target fails without changing app state', async () => {
    const result = await IOS.input.click(missing());
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('ELEMENT_NOT_FOUND');
    expect((await snapshot()).counter).toBe(0);
  });
});
