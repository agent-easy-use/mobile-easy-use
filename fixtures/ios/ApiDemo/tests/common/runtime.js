import ObjC from 'frida-objc-bridge';
const { describe, test, expect, run } = Test.create();
export { run };
describe('common', () => {
  test('main-thread dispatch returns values, adopts promises and preserves errors', async () => {
    const result = await common.runOnMainThread(() => ({
      main: Boolean(ObjC.classes.NSThread.isMainThread()),
      thread: common.currentThreadName(),
      value: 42,
    }));
    expect(result.main).toBe(true);
    expect(result.value).toBe(42);
    expect(typeof result.thread === 'string' || result.thread === null).toBe(true);
    expect(await common.runOnMainThread(() => Promise.resolve(7))).toBe(7);
    let error;
    try { await common.runOnMainThread(() => { throw new Error('main failure'); }); } catch (caught) { error = caught; }
    expect(String(error)).toContain('main failure');
    expect(await common.runOnMainThread(() => 9)).toBe(9);
  });
});

describe('common class lookup', () => {
  test('class lookup resolves exact and Swift suffix names and validates selectors', () => {
    expect(common.findClass('APISDKFixtureState', ['- single:']).$className).toBe('APISDKFixtureState');
    const swift = common.findClass('APIFindClassSwiftFixture', ['- primarySelector', '- secondarySelector']);
    expect(swift.$className.endsWith('.APIFindClassSwiftFixture')).toBe(true);
    let ambiguity;
    try { common.findClass('APIFindClassAmbiguousFixture', ['- sharedSelector']); }
    catch (error) { ambiguity = String(error); }
    expect(ambiguity).toContain('APIFindClassModuleOne.APIFindClassAmbiguousFixture');
    expect(ambiguity).toContain('APIFindClassModuleTwo.APIFindClassAmbiguousFixture');
    const selected = common.findClass('APIFindClassAmbiguousFixture', ['- onlyFirstSelector']);
    expect(selected.$className).toBe('APIFindClassModuleOne.APIFindClassAmbiguousFixture');
    expect(common.findClass('NoSuchApiDemoClass')).toBe(null);
    expect(common.findClass('APISDKFixtureState', ['- nonexistentSelector'])).toBe(null);
  });

});

describe('runtime identity', () => {
  test('runtime identity', () => {
    const status = runtimeStatus();
    expect({ platform: status.platform, available: status.available, appId: status.appId })
      .toEqual({ platform: 'ios', available: true, appId: 'com.agenteasyuse.mobileeasyuse.apidemo.ios' });
    expect(status.appId).toMatch(/^com\.agenteasyuse\.mobileeasyuse\.apidemo/);
    expect(status.appId).toContain('apidemo');
  });
});

// Swift source-level debugging is a different path; this checks the installed Frida bridge.
describe('Swift bridge export', () => {
  test('the public Swift bridge initializes in the App runtime', () => {
    expect(Swift.available, 'ApiDemo links the Swift runtime').toBe(true);
    expect(typeof Swift.NativeFunction).toBe('function');
  });
});
