import Java from 'frida-java-bridge';
const { describe, test, expect, run } = Test.create();
export { run };
describe('common', () => {
  test('main-thread dispatch returns values, adopts promises and preserves errors', async () => {
    const result = await common.runOnMainThread(() => {
      const Looper = Java.use('android.os.Looper');
      return {
        main: Looper.myLooper().$isSameObject(Looper.getMainLooper()),
        thread: common.currentThreadName(),
        value: 42,
      };
    });
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

describe('runtime identity', () => {
  test('runtime identity', () => {
    const status = runtimeStatus();
    expect({ platform: status.platform, available: status.available, appId: status.appId })
      .toEqual({ platform: 'android', available: true, appId: 'com.agenteasyuse.mobileeasyuse.apidemo' });
    expect(status.appId).toMatch(/^com\.agenteasyuse\.mobileeasyuse\.apidemo/);
    expect(status.appId).toContain('apidemo');
  });
});
