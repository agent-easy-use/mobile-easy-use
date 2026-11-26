import Java from 'frida-java-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const className = 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState';
const definition = { className, method: 'single', argumentTypes: ['java.lang.String'] };
let state, remove;
function callSingle(value) { return String(state.single(value)); }
function readString(value) { return String(value); }
describe('override.method', () => {
  beforeEach(() => {
    state = Java.use(className).getInstance();
    state.reset();
  });
  afterEach(async () => {
    if (remove) await remove();
    remove = undefined;
  });
  test('constant replacement bypasses native body and remove restores it', async () => {
    remove = await override.method(definition, "replacement");
    expect(callSingle('inside')).toBe('replacement');
    expect(state.getOriginalCallCount('single')).toBe(0);
    await remove();
    expect(callSingle('outside')).toBe('single:outside');
    expect(state.getOriginalCallCount('single')).toBe(1);
    await remove();
  });
  test('filter and replacement callback receive original arguments', async () => {
    remove = await override.method({ ...definition, filter: value => readString(value) === 'keep' }, value => {
      const replacement = `changed:${readString(value)}`;
      return replacement;
    });
    expect(callSingle('skip')).toBe('single:skip');
    expect(callSingle('keep')).toBe('changed:keep');
    expect(state.getOriginalCallCount('single')).toBe(1);
    await remove();
    expect(callSingle('keep')).toBe('single:keep');
  });
  test('static method replacement restores independently', async () => {
    const owner = Java.use(className);
    remove = await override.method({ className, method: "staticValue" }, "static-replaced");
    expect(String(owner.staticValue())).toBe('static-replaced');
    await remove();
    expect(String(owner.staticValue())).toBe('static-original');
  });
  test('primitive return replacement preserves the platform return contract', async () => {
    remove = await override.method({ className, method: "featureForScope" }, true);
    // Android uses Java bridge conversion; iOS BOOL replacement uses its native ABI value.
    expect(Boolean(state.featureForScope('disabled-scope'))).toBe(true);
    await remove();
    expect(Boolean(state.featureForScope('disabled-scope'))).toBe(false);
  });
  test('selecting an overload leaves other signatures unchanged', async () => {
    remove = await override.method({ className, method: 'overloaded', argumentTypes: ['int'] }, value => `changed:${value}`);
    expect(String(state.overloaded.overload('int').call(state, 7))).toBe('changed:7');
    expect(String(state.overloaded.overload('java.lang.String').call(state, 'seven'))).toBe('string:seven');
    await remove();
    expect(String(state.overloaded.overload('int').call(state, 7))).toBe('int:7');
  });
  test('duplicate method replacement is rejected and the first override stays active', async () => {
    remove = await override.method(definition, 'first');
    let failure, unexpectedRemove;
    try { unexpectedRemove = await override.method(definition, 'second'); }
    catch (error) { failure = error; }
    try {
      expect(String(failure)).toContain('already has an implementation');
      expect(callSingle('inside')).toBe('first');
    } finally {
      if (unexpectedRemove) await unexpectedRemove();
    }
    await remove();
    expect(callSingle('outside')).toBe('single:outside');
  });
});
