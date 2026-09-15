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

describe('input.text', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.text', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.text')).ok, 'Open text').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.text', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('text input focuses field and changes native text', async () => {
    const text = 'ApiDemo test 123';
    expect((await IOS.input.input(id('input.text'), text)).ok).toBe(true);
    await expect(id('input.text')).toBeFocused();
    expect((await snapshot()).text).toBe(text);
  });
});
