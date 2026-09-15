import { inspectPageState } from '/meu/presets.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

async function home() {
  if (!(await inspectPageState()).homeAttached) {
    await IOS.runOnMainThread(() => ObjC.classes.APIController.returnToMain());
  }
  expect((await IOS.wait.ui('api.menu.input', 'visible')).ok, 'Main ready').toBe(true);
}

describe('override.fields', () => {
  beforeEach(home);
  afterEach(home);

  for (const reject of [false, true]) {
    test(`scalar and object fields restore after ${reject ? 'rejection' : 'completion'}`, async () => {
      const state = ObjC.classes.APIOverrideFieldsFixture.alloc().init();
      try {
        const sentinel = new Error('expected action failure');
        let caught;
        try {
          await Override.run([{ target: state, field: '_mode', withValue: 3 },
            { target: state, field: '_region', withValue: ObjC.classes.NSString.stringWithString_('JP') }], async () => {
            await Promise.resolve();
            expect(Number(state.mode())).toBe(3);
            expect(String(state.region())).toBe('JP');
            if (reject) throw sentinel;
          });
        } catch (error) { caught = error; }
        expect(caught).toBe(reject ? sentinel : undefined);
        expect(Boolean(state.scalarsRestored())).toBe(true);
        expect(Boolean(state.objectsRestored())).toBe(true);
      } finally { state.release(); }
    });
  }
});
