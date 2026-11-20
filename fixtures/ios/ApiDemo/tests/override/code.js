import { code } from '../../../../../sdk/ios/override/code.js';
import { breakpoint, runNative } from '../common/debugger/helpers/fixture.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
let remove;
describe('override.code', () => {
  afterEach(async () => { if (remove) await remove(); remove = undefined; });
  test('native writes remain active until remove and repeated remove is harmless', async () => {
    remove = await code(breakpoint(), { price: '40' });
    expect((await runNative()).values).toEqual([45]);
    await remove();
    expect((await runNative()).values).toEqual([15]);
    await remove();
  });
  test('condition leaves nonmatching native execution unchanged', async () => {
    remove = await code({ ...breakpoint(), condition: 'price == 999' }, { price: '40' });
    expect((await runNative()).values).toEqual([15]);
    await remove();
    remove = await code({ ...breakpoint(), condition: 'price == 10' }, { price: '40' });
    expect((await runNative()).values).toEqual([45]);
  });
  test('Swift local writes affect the native caller and are removed', async () => {
    remove = await code(breakpoint('swift'), { price: '40' });
    expect((await runNative('swift')).values).toEqual([45]);
    await remove();
    expect((await runNative('swift')).values).toEqual([15]);
  });
  test('Objective-C early return bypasses the native body until remove', async () => {
    remove = await code(breakpoint('oc', 'BP_RETURN_INT'), undefined, '(int)200');
    const replaced = await runNative('returnInt');
    expect(replaced.values).toEqual([200]);
    expect(replaced.tail).toBe(0);
    await remove();
    const restored = await runNative('returnInt');
    expect(restored.values).toEqual([7]);
    expect(restored.tail).toBe(1);
  });
});
