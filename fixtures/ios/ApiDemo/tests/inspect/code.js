const { code } = inspect;
import { breakpoint, runNative } from '../common/debugger/helpers/fixture.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
let watcher;
describe('inspect.code', () => {
  afterEach(async () => { if (watcher) await watcher.stop(); watcher = undefined; });
  test('current reads accumulated evidence and stop freezes it', async () => {
    watcher = await code.watch(breakpoint(), { capture: { price: 'price' }, stack: 2 });
    expect((await watcher.current()).data).toEqual([]);
    expect((await runNative()).values).toEqual([15]);
    const current = await watcher.current();
    expect(current.ok, current.error ?? 'capture succeeds').toBe(true);
    expect(current.data[0].capture).toEqual({ price: 10 });
    expect(current.data[0].stack.length).toBeLessThanOrEqual(2);
    const editable = await watcher.current();
    editable.data[0].capture.price = 99;
    expect(await watcher.current()).toEqual(current);
    expect(await watcher.stop()).toEqual(current);
    await runNative();
    expect(await watcher.stop()).toEqual(current);
    expect((await watcher.current()).ok).toBe(false);
  });
  test('default records contain metadata without implicit capture or stack', async () => {
    watcher = await code.watch(breakpoint());
    await runNative();
    const result = await watcher.stop();
    expect(result.ok, result.error ?? 'capture succeeds').toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].capture).toBe(undefined);
    expect(result.data[0].stack).toBe(undefined);
  });
  for (const language of ['oc', 'swift']) {
    test(`${language} conditions filter native hits before expression capture`, async () => {
      watcher = await code.watch({ ...breakpoint(language), condition: 'price == 999' }, {
        capture: { price: 'price' },
      });
      expect((await runNative(language)).values).toEqual([15]);
      const rejected = await watcher.stop();
      expect(rejected.ok, rejected.error ?? 'condition succeeds').toBe(true);
      expect(rejected.data).toEqual([]);
      watcher = await code.watch({ ...breakpoint(language), condition: 'price == 10' }, {
        capture: { price: 'price', computed: 'price * 2', label: 'label' },
      });
      expect((await runNative(language)).values).toEqual([15]);
      const accepted = await watcher.stop();
      expect(accepted.ok, accepted.error ?? 'capture succeeds').toBe(true);
      expect(accepted.data.length).toBe(1);
      expect(accepted.data[0].capture).toEqual({ price: 10, computed: 20, label: 'hello 世界' });
    });
  }
});
