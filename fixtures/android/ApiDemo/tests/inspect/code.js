const { code } = inspect;
import { breakpoint, reset, runNative } from '../common/debugger/helpers/fixture.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
let watcher;
describe('inspect.code', () => {
  afterEach(async () => { if (watcher) await watcher.stop(); watcher = undefined; });
  test('current is cumulative, condition precedes capture and stop freezes records', async () => {
    reset();
    const { target, ...location } = breakpoint();
    watcher = await code.watch({ className: target, ...location, condition: ({ get }) => get('input') === 2 },
      { capture: { input: 'input', local: ({ get }) => get('local') }, stack: 2 });
    expect((await watcher.current()).data).toEqual([]);
    expect((await runNative('sequence', 2)).values).toEqual(['12', '14']);
    const current = await watcher.current();
    expect(current.ok, current.error ?? 'capture succeeds').toBe(true);
    expect(current.data[0].capture).toEqual({ input: 2, local: 12 });
    expect(current.data[0].stack.length).toBeLessThanOrEqual(2);
    expect(await watcher.stop()).toEqual(current);
    reset();
    await runNative('sequence', 2);
    expect(await watcher.stop()).toEqual(current);
    expect((await watcher.current()).ok).toBe(false);
  });
  test('default capture and partial errors retain hit metadata', async () => {
    reset();
    const { target, ...location } = breakpoint();
    watcher = await code.watch({ className: target, ...location });
    await runNative();
    const result = await watcher.stop();
    expect(result.ok).toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].capture).toBe(undefined);
    expect(result.data[0].stack).toBe(undefined);
    watcher = await code.watch({ className: target, ...location }, { capture: { missing: 'absent', input: 'input' } });
    reset();
    await runNative();
    const partial = await watcher.stop();
    expect(partial.ok).toBe(false);
    expect(partial.data[0].capture.input).toBe(1);
  });
  test('captured Java wrappers remain usable after stop while get expires', async () => {
    reset();
    let savedGet;
    const { target, ...location } = breakpoint('typeObject', 'BP_TYPE_Object');
    watcher = await code.watch({ className: target, ...location }, { capture: {
      object: ({ get }) => { savedGet = get; return get('local'); },
    } });
    const state = await runNative('typeObject');
    const first = await watcher.current();
    const object = first.data[0].capture.object;
    first.data[0].capture.object = null;
    const result = await watcher.stop();
    expect(result.ok).toBe(true);
    expect(result.data[0].capture.object).toBe(object);
    expect(String(object.label.value)).toBe(state.values[0]);
    let message;
    try { savedGet('local'); } catch (error) { message = error.message; }
    expect(message).toMatch(/valid|expired|active/i);
  });

  test('capacity rejection preserves records while the native workload finishes', async () => {
    reset();
    const { target, ...location } = breakpoint();
    watcher = await code.watch({ className: target, ...location });
    const state = await runNative('sequence', 10001);
    const result = await watcher.stop();
    expect(state.tail).toBe(10001);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/limit|capacity/i);
    expect(result.data.length).toBe(10000);
  });

  test('reads arguments, locals, thread and bounded frames without changing native results', async () => {
    reset();
    const { target, ...location } = breakpoint();
    watcher = await code.watch({ className: target, ...location }, { capture: { input: 'input', local: 'local' }, stack: 3 });
    expect((await runNative()).values).toEqual(['12']);
    const result = await watcher.stop();
    expect(result.ok).toBe(true);
    expect(result.data[0].capture).toEqual({ input: 1, local: 11 });
    expect(result.data[0].threadName).toBe('debugger-mvp-worker');
    expect(result.data[0].stack.length).toBeGreaterThan(0);
    expect(result.data[0].stack.length).toBeLessThanOrEqual(3);
  });

  test('same-location watchers filter independently and survive peer removal', async () => {
    reset();
    const { target, ...location } = breakpoint();
    const first = await code.watch({ className: target, ...location, condition: ({ get }) => get('input') === 1 },
      { capture: { input: 'input' } });
    try {
      watcher = await code.watch({ className: target, ...location, condition: ({ get }) => get('input') === 2 },
        { capture: { input: 'input' } });
      await runNative('sequence', 2);
      expect((await first.stop()).data.map(record => record.capture.input)).toEqual([1]);
      reset();
      await runNative('sequence', 2);
      expect((await watcher.stop()).data.map(record => record.capture.input)).toEqual([2, 2]);
    } finally { await first.stop(); }
  });

  test('concurrent hits retain each input exactly once and repeated stop returns the same records', async () => {
    reset();
    const { target, ...location } = breakpoint();
    watcher = await code.watch({ className: target, ...location }, { capture: { input: 'input' } });
    const state = await runNative('concurrent', 5);
    const [result, repeated] = await Promise.all([watcher.stop(), watcher.stop()]);
    expect(result.ok).toBe(true);
    expect(result.data.length).toBe(20);
    expect(new Set(result.data.map(record => record.hitId)).size).toBe(20);
    expect(result.data.map(record => record.capture.input).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(repeated).toEqual(result);
    expect(state.tail).toBe(20);
  });

  test('capture fields share get during a hit and cannot use it afterward', async () => {
    reset();
    let saved;
    const { target, ...location } = breakpoint();
    watcher = await code.watch({ className: target, ...location }, { capture: {
      first: ({ get }) => { saved = get; return get('input'); }, second: () => saved('local'),
    } });
    await runNative();
    expect((await watcher.stop()).data[0].capture).toEqual({ first: 1, second: 11 });
    let message;
    try { saved('input'); } catch (error) { message = error.message; }
    expect(message).toMatch(/only valid during/);
  });

  test('overloaded methods require an explicit signature', async () => {
    reset();
    const { target, ...location } = breakpoint('overloaded', 'BP_OVERLOAD_INT');
    let message;
    try { await code.watch({ className: target, ...location }); } catch (error) { message = error.message; }
    expect(message).toMatch(/argumentTypes/);
    watcher = await code.watch({ className: target, ...location, argumentTypes: ['int'] }, { capture: { value: 'value' } });
    expect((await runNative('overloaded')).values).toEqual(['1']);
    expect((await watcher.stop()).data[0].capture.value).toBe(1);
  });

});
