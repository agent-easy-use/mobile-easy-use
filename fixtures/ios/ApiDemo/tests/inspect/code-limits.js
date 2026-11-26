import { breakpoint, runNative } from '../common/debugger/helpers/fixture.js';
const { describe, test, expect, run } = Test.create();
export { run };
describe('inspect.code capacity', () => {
  test('evidence limit does not stop native execution or prevent later watches', async () => {
    const watcher = await inspect.code.watch(breakpoint());
    try {
      // Yield the App main queue between batches; a single 10,001-hit loop
      // would prevent UIKit and Frida's main-thread work from progressing.
      let completed = 0;
      while (completed < 10001) {
        const count = Math.min(100, 10001 - completed);
        const native = await runNative('oc', count);
        expect(native.values.length).toBe(count);
        expect(native.values.every(value => value === 15)).toBe(true);
        completed += count;
      }
      const result = await watcher.stop();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('limit');
      expect(result.data.length).toBe(10000);
    } finally { await watcher.stop(); }
    const next = await inspect.code.watch(breakpoint());
    try {
      expect((await runNative()).values).toEqual([15]);
      const captured = await next.stop();
      expect(captured.ok, captured.error).toBe(true);
      expect(captured.data.length).toBe(1);
    } finally { await next.stop(); }
  });
});
