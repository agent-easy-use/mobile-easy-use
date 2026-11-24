import ObjC from 'frida-objc-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const className = 'APISDKFixtureState';
const definition = { className, selector: '- single:' };
let state, remove;
function callSingle(value) { return String(state.single_(value)); }
function readString(value) { return String(new ObjC.Object(value)); }
describe('override.method', () => {
  beforeEach(() => {
    state = ObjC.classes.APISDKFixtureState.sharedState();
    state.resetForCategory_scenario_('test', 'method');
  });
  afterEach(async () => {
    if (remove) await remove();
    remove = undefined;
  });
  test('constant replacement bypasses native body and remove restores it', async () => {
    remove = await override.method(definition, ObjC.classes.NSString.stringWithString_('replacement'));
    expect(callSingle('inside')).toBe('replacement');
    expect(Number(state.originalCallCount_('single:'))).toBe(0);
    await remove();
    expect(callSingle('outside')).toBe('single:outside');
    expect(Number(state.originalCallCount_('single:'))).toBe(1);
    await remove();
  });
  test('filter and replacement callback receive original arguments', async () => {
    remove = await override.method({ ...definition, filter: value => readString(value) === 'keep' }, value => {
      const replacement = `changed:${readString(value)}`;
      return ObjC.classes.NSString.stringWithString_(replacement).handle;
    });
    expect(callSingle('skip')).toBe('single:skip');
    expect(callSingle('keep')).toBe('changed:keep');
    expect(Number(state.originalCallCount_('single:'))).toBe(1);
    await remove();
    expect(callSingle('keep')).toBe('single:keep');
  });
  test('static method replacement restores independently', async () => {
    const owner = ObjC.classes.APISDKFixtureState;
    remove = await override.method({ className, selector: "+ staticValue" }, ObjC.classes.NSString.stringWithString_('static-replaced'));
    expect(String(owner.staticValue())).toBe('static-replaced');
    await remove();
    expect(String(owner.staticValue())).toBe('static-original');
  });
  test('primitive return replacement preserves the platform return contract', async () => {
    remove = await override.method({ className, selector: "- featureForScope:" }, 1);
    // Android uses Java bridge conversion; iOS BOOL replacement uses its native ABI value.
    expect(Boolean(state.featureForScope_('disabled-scope'))).toBe(true);
    await remove();
    expect(Boolean(state.featureForScope_('disabled-scope'))).toBe(false);
  });
});

describe('override.method nesting', () => {
test('nested replacements restore in reverse installation order', async () => {
  const definition = { className: 'APISDKFixtureState', selector: '+ staticValue' };
  const owner = ObjC.classes.APISDKFixtureState;
  const firstValue = ObjC.classes.NSString.stringWithString_('first');
  const secondValue = ObjC.classes.NSString.stringWithString_('second');
  const first = await override.method(definition, firstValue.handle);
  let second;
  try {
    second = await override.method(definition, secondValue.handle);
    expect(String(owner.staticValue())).toBe('second');
    await second();
    expect(String(owner.staticValue())).toBe('first');
    await first();
    expect(String(owner.staticValue())).toBe('static-original');
  } finally { if (second) await second(); await first(); }
});

});
