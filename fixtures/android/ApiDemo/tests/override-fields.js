import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

const CONTROLLER = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';

async function home() {
  if (!(await inspectPageState()).homeVisible) {
    await AndroidExp.runOnMainThread(() => Java.use(CONTROLLER).returnToMain());
  }
  expect((await AndroidExp.wait.ui(R.id.api_menu_input, 'visible')).ok, 'Main ready').toBe(true);
}

describe('override.fields', () => {
  beforeEach(home);
  afterEach(home);

  for (const reject of [false, true]) {
    test(`scalar and object fields restore after ${reject ? 'rejection' : 'completion'}`, async () => {
      let state;
      Java.performNow(() => { state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.OverrideFieldsFixture').$new(); });
      try {
        const sentinel = new Error('expected action failure');
        let caught;
        try {
          await Override.run([{ target: state, field: 'mode', withValue: 3 },
            { target: state, field: 'region', withValue: 'JP' }], async () => {
            await Promise.resolve();
            Java.performNow(() => {
              expect(Number(state.mode.value)).toBe(3);
              expect(String(state.region.value)).toBe('JP');
            });
            if (reject) throw sentinel;
          });
        } catch (error) { caught = error; }
        expect(caught).toBe(reject ? sentinel : undefined);
        Java.performNow(() => expect(Boolean(state.restored())).toBe(true));
      } finally { Java.performNow(() => state.$dispose()); }
    });
  }
});
