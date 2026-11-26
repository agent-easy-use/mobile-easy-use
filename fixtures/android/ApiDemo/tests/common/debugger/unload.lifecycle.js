import { breakpoint, reset, runNative } from './helpers/fixture.js';
export async function arm() {
  reset();
  const { target, ...location } = breakpoint();
  // Leave both kinds of registration in the installed SDK for unload cleanup.
  await override.code({ className: target, ...location }, undefined, 99);
  const state = await runNative();
  if (state.values[0] !== '99' || state.tail !== 0) throw new Error('Override was not active before unload');
  const watched = breakpoint('typeObject', 'BP_TYPE_Object');
  const watcher = await inspect.code.watch({ className: watched.target, method: watched.method, fileLine: watched.fileLine },
    { capture: { object: 'local' } });
  reset();
  await runNative('typeObject');
  const captured = await watcher.current();
  if (!captured.ok || captured.data.length !== 1) throw new Error('Watcher was not active before unload');
  // Intentionally omit remove/stop. The Host unloads this SDK and reconnects to the same process.
  return { armed: true, pid: Process.id, cleanup: 'script-unload' };
}
const { describe, test, expect, run } = Test.create();
export { run };
describe('JVMTI script unload', () => {
  test('native execution and new watches work after unloading the owning SDK', async () => {
    reset();
    const state = await runNative();
    expect(state.values).toEqual(['12']);
    expect(state.tail).toBe(1);
    expect(state.finally).toBe(1);
    const watched = breakpoint('typeObject', 'BP_TYPE_Object');
    const watcher = await inspect.code.watch({ className: watched.target, method: watched.method, fileLine: watched.fileLine });
    try {
      reset();
      const objectState = await runNative('typeObject');
      expect(objectState.tail).toBe(1);
      const captured = await watcher.current();
      expect(captured.ok).toBe(true);
      expect(captured.data.length).toBe(1);
    } finally {
      await watcher.stop();
    }
  });
});

export function pid() { return Process.id; }
