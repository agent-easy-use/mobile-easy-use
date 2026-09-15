import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

async function overrideObservation(fail) {
  const state = ObjC.classes.APISDKFixtureState.sharedState();
  const sentinel = new Error('expected action failure');
  let inside, caught;
  try {
    inside = await Override.run([{ target: 'APISDKFixtureState', selector: '- single:',
      withReturn: ObjC.classes.NSString.stringWithString_('test-replacement') }], async () => {
      await Promise.resolve();
      const value = String(state.single_('inside'));
      expect(value).toBe('test-replacement');
      if (fail) throw sentinel;
      return value;
    });
  } catch (error) { caught = error; }
  return { inside, caught, sentinel, outside: String(state.single_('outside')) };
}

describe('override', () => {
  beforeEach(async () => {
    await home();
    expect((await IOS.input.click('api.menu.input')).ok, 'Open input').toBe(true);
    expect((await IOS.wait.ui('api.input.scenario.click', 'visible')).ok).toBe(true);
    expect((await IOS.input.click('api.input.scenario.click')).ok, 'Open click').toBe(true);
    expect((await IOS.wait.ui('api.input.ready.click', 'visible')).ok, 'Scenario ready').toBe(true);
  });
  afterEach(home);

  test('async method override restores native implementation', async () => {
    const result = await overrideObservation(false);
    expect(result.caught).toBe(undefined);
    expect(result.inside).toBe('test-replacement');
    expect(result.outside).toBe('single:outside');
  });
  test('action rejection also restores native implementation', async () => {
    const result = await overrideObservation(true);
    expect(result.caught).toBe(result.sentinel);
    expect(result.outside).toBe('single:outside');
  });
});
