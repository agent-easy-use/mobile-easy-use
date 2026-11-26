import ObjC from 'frida-objc-bridge';
const { describe, test, expect, run } = Test.create();
export { run };
export function pid() { return Process.id; }
export async function arm() {
  const state = ObjC.classes.APISDKFixtureState.sharedState();
  const logs = await inspect.log.watch(['MEU.ApiDemo']);
  const methods = await inspect.method.watch({ className: 'APISDKFixtureState', selector: '- single:' });
  state.emitPrimaryLog();
  if ((await logs.current()).data.length !== 1) throw new Error('Log watcher did not capture');
  if (String(state.single_('value')) !== 'single:value' || (await methods.current()).data.length !== 1) {
    throw new Error('Method watcher did not preserve native behavior');
  }
  // Deliberately leave both watchers active. Host disconnect unloads their owning SDK.
  return { armed: true, pid: Process.id };
}
describe('inspect script unload', () => {
  test('native methods and log subscriptions work after unloading active watchers', async () => {
    const state = ObjC.classes.APISDKFixtureState.sharedState();
    expect(String(state.single_('value'))).toBe('single:value');
    const methods = await inspect.method.watch({ className: 'APISDKFixtureState', selector: '- single:' });
    const logs = await inspect.log.watch(['MEU.ApiDemo']);
    try {
      state.emitPrimaryLog();
      expect(String(state.single_('value'))).toBe('single:value');
      expect((await methods.stop()).data.length).toBe(1);
      expect((await logs.stop()).data.length).toBe(1);
    } finally { await methods.stop(); await logs.stop(); }
  });
});
