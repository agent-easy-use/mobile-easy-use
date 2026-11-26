import { breakpoint, runNative } from './helpers/fixture.js';
export async function arm() {
  await override.code(breakpoint(), { price: '40' });
  if ((await runNative()).values[0] !== 45) throw new Error('Override was not active before unload');
  return { armed: true, pid: Process.id, cleanup: 'script-unload' };
}
const { describe, test, expect, run } = Test.create();
export { run };
describe('LLDB script unload', () => {
  test('native execution is restored after unloading the owning SDK', async () => {
    const state = await runNative();
    expect(state.values).toEqual([15]);
    expect(state.tail).toBe(1);
  });
});

export function pid() { return Process.id; }
