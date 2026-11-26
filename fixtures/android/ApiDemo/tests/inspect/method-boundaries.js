import Java from 'frida-java-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const className = 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture';
let state, watchers;
describe('inspect.method boundaries', () => {
  beforeEach(() => { state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture').getInstance(); state.reset(); watchers = []; });
  afterEach(async () => { for (const watcher of watchers.reverse()) await watcher.stop(); });
  test('business recursion records each native call once', async () => {
    const watcher = await inspect.method.watch({ className, method: 'recursive' }, {
      enter: ({ args }) => ({ depth: args[0] }), leave: ({ result }) => ({ value: result }),
    });
    watchers.push(watcher);
    expect(state.recursive(3)).toBe(4);
    const result = await watcher.stop();
    expect(result.ok, result.error).toBe(true);
    expect(result.data.map(record => record.enter.depth)).toEqual([3, 2, 1, 0]);
    expect(result.data.map(record => record.leave.value)).toEqual([4, 3, 2, 1]);
    expect(Number(state.getCalls())).toBe(4);
  });
  test('capture errors preserve native results and permit a fresh watcher', async () => {
    const definition = { className, method: 'plain' };
    const watcher = await inspect.method.watch(definition, { enter: () => { throw new Error('capture failure'); } });
    watchers.push(watcher);
    expect(String(state.plain('value'))).toBe('plain:value');
    const failed = await watcher.stop();
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('capture failure');
    expect(failed.data[0].status).toBe('returned');
    const next = await inspect.method.watch(definition);
    watchers.push(next);
    expect(String(state.plain('value'))).toBe('plain:value');
    expect((await next.stop()).data.length).toBe(1);
    expect(Number(state.getCalls())).toBe(2);
  });
  test('capacity rejects evidence while native calls keep completing', async () => {
    const watcher = await inspect.method.watch({ className, method: 'plain' });
    watchers.push(watcher);
    let last;
    for (let i = 0; i < 10001; i++) last = String(state.plain('value'));
    const result = await watcher.stop();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('limit');
    expect(result.data.length).toBe(10000);
    expect(last).toBe('plain:value');
    expect(Number(state.getCalls())).toBe(10001);
  });
  test('native workers preserve arguments, return values and thread names', async () => {
    const watcher = await inspect.method.watch({ className, method: 'worker' }, {
      enter: ({ args }) => ({ id: args[0], thread: common.currentThreadName() }),
      leave: ({ result }) => ({ value: result }),
    });
    watchers.push(watcher);
    state.startWorkers();
    const ready = await drive.waitUntil(() => Number(state.getWorkersDone()) === 2);
    expect(ready.ok, 'Both native workers finish').toBe(true);
    const result = await watcher.stop();
    expect(result.ok, result.error).toBe(true);
    expect(result.data.length).toBe(2);
    const records = result.data.sort((left, right) => left.enter.id - right.enter.id);
    expect(records.map(record => record.leave.value)).toEqual([10, 20]);
    expect(records.map(record => record.enter.thread)).toEqual(['capture-w1', 'capture-w2']);
    expect(new Set(records.map(record => record.threadId)).size).toBe(2);
  });
  test('stop from capture freezes the running record without changing the native result', async () => {
    let stopping;
    const watcher = await inspect.method.watch({ className, method: 'plain' }, {
      enter: () => { stopping = watcher.stop(); return {}; },
    });
    watchers.push(watcher);
    expect(String(state.plain('value'))).toBe('plain:value');
    const stopped = await stopping;
    expect(stopped.ok, stopped.error).toBe(true);
    expect(stopped.data[0].status).toBe('running');
    expect(String(state.plain('value'))).toBe('plain:value');
    expect(await watcher.stop()).toEqual(stopped);
    expect(Number(state.getCalls())).toBe(2);
  });
});
