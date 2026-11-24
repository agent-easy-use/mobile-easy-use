import ObjC from 'frida-objc-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const className = 'APIChainCaptureFixture';
let state, watchers;
describe('inspect.method boundaries', () => {
  beforeEach(() => { state = ObjC.classes.APIChainCaptureFixture.sharedState(); state.reset(); watchers = []; });
  afterEach(async () => { for (const watcher of watchers.reverse()) await watcher.stop(); });
  test('business recursion records each native call once', async () => {
    const watcher = await inspect.method.watch({ className, selector: '- recursive:' }, {
      enter: ({ args }) => ({ depth: args[0] }), leave: ({ result }) => ({ value: result }),
    });
    watchers.push(watcher);
    expect(state.recursive_(3)).toBe(4);
    const result = await watcher.stop();
    expect(result.ok, result.error).toBe(true);
    expect(result.data.map(record => record.enter.depth)).toEqual([3, 2, 1, 0]);
    expect(result.data.map(record => record.leave.value)).toEqual([4, 3, 2, 1]);
    expect(Number(state.calls())).toBe(4);
  });
  test('capture errors preserve native results and permit a fresh watcher', async () => {
    const definition = { className, selector: '- plain:' };
    const watcher = await inspect.method.watch(definition, { enter: () => { throw new Error('capture failure'); } });
    watchers.push(watcher);
    expect(String(state.plain_('value'))).toBe('plain:value');
    const failed = await watcher.stop();
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('capture failure');
    expect(failed.data[0].status).toBe('returned');
    const next = await inspect.method.watch(definition);
    watchers.push(next);
    expect(String(state.plain_('value'))).toBe('plain:value');
    expect((await next.stop()).data.length).toBe(1);
    expect(Number(state.calls())).toBe(2);
  });
  test('capacity rejects evidence while native calls keep completing', async () => {
    const watcher = await inspect.method.watch({ className, selector: '- plain:' });
    watchers.push(watcher);
    let last;
    for (let i = 0; i < 10001; i++) last = String(state.plain_('value'));
    const result = await watcher.stop();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('limit');
    expect(result.data.length).toBe(10000);
    expect(last).toBe('plain:value');
    expect(Number(state.calls())).toBe(10001);
  });
  test('native workers preserve arguments, return values and thread names', async () => {
    const watcher = await inspect.method.watch({ className, selector: '- worker:' }, {
      enter: ({ args }) => ({ id: args[0], thread: common.currentThreadName() }),
      leave: ({ result }) => ({ value: result }),
    });
    watchers.push(watcher);
    state.startWorkers();
    const ready = await drive.waitUntil(() => Number(state.workersDone()) === 2);
    expect(ready.ok, 'Both native workers finish').toBe(true);
    const result = await watcher.stop();
    expect(result.ok, result.error).toBe(true);
    expect(result.data.length).toBe(2);
    const records = result.data.sort((left, right) => left.enter.id - right.enter.id);
    expect(records.map(record => record.leave.value)).toEqual([10, 20]);
    expect(records.map(record => record.enter.thread)).toEqual(['capture-worker-1', 'capture-worker-2']);
    expect(new Set(records.map(record => record.threadId)).size).toBe(2);
  });
  test('stop from capture freezes the running record without changing the native result', async () => {
    let stopping;
    const watcher = await inspect.method.watch({ className, selector: '- plain:' }, {
      enter: () => { stopping = watcher.stop(); return {}; },
    });
    watchers.push(watcher);
    expect(String(state.plain_('value'))).toBe('plain:value');
    const stopped = await stopping;
    expect(stopped.ok, stopped.error).toBe(true);
    expect(stopped.data[0].status).toBe('running');
    expect(String(state.plain_('value'))).toBe('plain:value');
    expect(await watcher.stop()).toEqual(stopped);
    expect(Number(state.calls())).toBe(2);
  });
});

describe('inspect.method ABI', () => {
  for (const [selector, invoke, expected] of [
    ['- floating:', state => state.floating_(1.25), 1.75],
    ['- rangeValue:', state => state.rangeValue_([2, 3]), [3, 3]],
    ['- booleanValue:', state => state.booleanValue_(true), 1],
    ['- signedValue:', state => state.signedValue_(int64('-9223372036854775808')), '-9223372036854775808'],
    ['- unsignedValue:', state => state.unsignedValue_(uint64('18446744073709551615')), '18446744073709551615'],
  ]) {
    test(`native ABI is preserved for ${selector}`, async () => {
      const state = ObjC.classes.APIChainCaptureFixture.sharedState();
      const normalize = value => Array.isArray(value) ? value.map(Number)
        : typeof value === 'object' ? value.toString() : Number(value);
      const watcher = await inspect.method.watch({ className, selector }, {
        enter: ({ args }) => ({ value: normalize(args[0]) }),
        leave: ({ result }) => ({ value: normalize(result) }),
      });
      try {
        expect(normalize(invoke(state))).toEqual(expected);
        const captured = await watcher.stop();
        expect(captured.ok, captured.error).toBe(true);
        expect(captured.data.length).toBe(1);
        expect(captured.data[0].leave.value).toEqual(expected);
        expect(normalize(invoke(state))).toEqual(expected);
      } finally { await watcher.stop(); }
    });
  }

  test('stacked watchers restore in reverse order without losing the original method', async () => {
    const definition = { className, selector: '- plain:' };
    const state = ObjC.classes.APIChainCaptureFixture.sharedState();
    const outer = await inspect.method.watch(definition);
    let inner;
    try {
      inner = await inspect.method.watch(definition);
      expect(String(state.plain_('both'))).toBe('plain:both');
      expect((await inner.stop()).data.length).toBe(1);
      expect(String(state.plain_('outer'))).toBe('plain:outer');
      expect((await outer.stop()).data.length).toBe(2);
      expect(String(state.plain_('restored'))).toBe('plain:restored');
    } finally { if (inner) await inner.stop(); await outer.stop(); }
  });

});
