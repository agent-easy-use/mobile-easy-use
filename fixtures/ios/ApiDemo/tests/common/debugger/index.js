import { installDebugger } from '../../../../../../sdk/ios/common/debugger.js';
import { breakpoint, runNative } from './helpers/fixture.js';

const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const stops = [];
async function install(definition) {
  const stop = await installDebugger(definition);
  stops.push(stop);
  return stop;
}

describe('LLDB debugger', () => {
  afterEach(async () => {
    let failure;
    while (stops.length) {
      try { await stops.pop()(); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  });
  for (const language of ['oc', 'swift']) {
    test(`${language} reads locals, expressions and bounded source frames`, async () => {
      const stop = await install({ breakpoint: breakpoint(language), stack: 3,
        capture: { price: 'price', label: 'label', computed: 'price * 2', empty: 'empty' } });
      const state = await runNative(language);
      const result = await stop();
      expect(result.ok, result.error ?? 'capture succeeds').toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].capture.price).toBe(10);
      expect(result.data[0].capture.label).toBe('hello 世界');
      expect(result.data[0].capture.computed).toBe(20);
      expect(result.data[0].capture.empty).toBe(null);
      expect(result.data[0].stack.length).toBeGreaterThan(0);
      expect(result.data[0].stack.length).toBeLessThanOrEqual(3);
      expect(state.values).toEqual([15]);
    });

    test(`${language} native condition rejects capture and mutation`, async () => {
      const stop = await install({ breakpoint: { ...breakpoint(language), condition: 'price == 999' },
        capture: { price: 'price' }, overrides: { price: '99' } });
      const state = await runNative(language);
      const result = await stop();
      expect(result.ok, result.error ?? 'condition succeeds').toBe(true);
      expect(result.data).toEqual([]);
      expect(state.values).toEqual([15]);
    });

    test(`${language} capture precedes writes and original native execution sees the write`, async () => {
      const stop = await install({ breakpoint: breakpoint(language), capture: { before: 'price' }, overrides: { price: 'price * 3' } });
      const state = await runNative(language);
      const result = await stop();
      expect(result.ok, result.error ?? 'write succeeds').toBe(true);
      expect(result.data[0].capture.before).toBe(10);
      expect(state.values).toEqual([35]);
      expect(state.tail).toBe(1);
    });

    test(`${language} partial expression failure preserves other observations`, async () => {
      const stop = await install({ breakpoint: breakpoint(language), capture: { missing: 'missingVariable', price: 'price' } });
      const state = await runNative(language);
      const result = await stop();
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/missing/);
      expect(result.data[0].capture.price).toBe(10);
      expect(state.values).toEqual([15]);
    });
  }

  test('native conditions remain valid after expression capture in the same session', async () => {
    const capture = await install({ breakpoint: breakpoint(), stack: 3,
      capture: { price: 'price', label: 'label', computed: 'price * 2', empty: 'empty' } });
    await runNative();
    expect((await capture()).ok).toBe(true);
    const conditional = await install({ breakpoint: { ...breakpoint(), condition: 'price == 999' },
      capture: { unexpected: 'price' }, overrides: { price: '99' } });
    const state = await runNative();
    const result = await conditional();
    expect(result.ok, result.error ?? 'native condition evaluates in the current frame').toBe(true);
    expect(result.data).toEqual([]);
    expect(state.values).toEqual([15]);
  });

  test('same-location native conditions dispatch only the matching callback', async () => {
    const accepted = await install({ breakpoint: { ...breakpoint(), condition: 'price == 10' }, capture: { matched: 'price' } });
    const rejected = await install({ breakpoint: { ...breakpoint(), condition: 'price == 999' }, capture: { wrong: 'price' } });
    await runNative('oc', 2);
    expect((await rejected()).data).toEqual([]);
    await runNative();
    const result = await accepted();
    expect(result.ok, result.error ?? 'dispatch succeeds').toBe(true);
    expect(result.data.map(record => record.capture.matched)).toEqual([10, 10, 10]);
  });

  test('condition evaluation errors skip the capture callback', async () => {
    const stop = await install({ breakpoint: { ...breakpoint(), condition: 'missingConditionVariable' }, capture: { unexpected: 'price' } });
    const state = await runNative();
    const result = await stop();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/condition/i);
    expect(result.data).toEqual([]);
    expect(state.values).toEqual([15]);
  });

  test('failed registration leaves the App running and permits the next breakpoint', async () => {
    let failure;
    try {
      await install({ breakpoint: { ...breakpoint(), file: '/missing-debugger-fixture.m' } });
    } catch (error) { failure = error; }
    expect(String(failure)).toMatch(/Source file/);
    expect((await runNative()).values).toEqual([15]);
    const stop = await install({ breakpoint: breakpoint(), capture: { price: 'price' } });
    await runNative();
    const result = await stop();
    expect(result.ok, result.error ?? 'registration after failure succeeds').toBe(true);
    expect(result.data[0].capture.price).toBe(10);
  });

  test('stop shares the result and removes mutations from subsequent calls', async () => {
    const stop = await install({ breakpoint: breakpoint(), overrides: { price: '40' } });
    expect((await runNative()).values).toEqual([45]);
    const [first, second] = await Promise.all([stop(), stop()]);
    expect(first.ok, first.error ?? 'stop succeeds').toBe(true);
    expect(second).toEqual(first);
    expect((await runNative()).values).toEqual([15]);
    expect(await stop()).toEqual(first);
  });
});
