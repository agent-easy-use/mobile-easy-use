import Java from 'frida-java-bridge';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
let watchers = [];
describe('inspect.log', () => {
  afterEach(async () => {
    for (const watcher of watchers.reverse()) await watcher.stop();
    watchers = [];
  });
  test('exact tags, overlapping subscriptions and independent stop preserve evidence', async () => {
    const primary = await inspect.log.watch(['MEU.ApiDemo']);
    watchers.push(primary);
    const combined = await inspect.log.watch(['MEU.ApiDemo', 'MEU.ApiDemo.Other']);
    watchers.push(combined);
    const state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState').getInstance();
    // These native methods emit synchronously: no arbitrary sleep before reading.
    state.emitDebugLog(); state.emitWarningLog(); state.emitOtherTagLog(); state.emitNoiseLog();
    const first = await primary.current();
    expect(first.ok, first.error ?? 'primary capture succeeds').toBe(true);
    expect(first.data.map(record => record.message)).toEqual(['chain-debug', 'chain-warning']);
    expect(first.data.every(record => record.tag === 'MEU.ApiDemo')).toBe(true);
    const record = first.data[0];
    expect(Number.isFinite(Date.parse(record.timestamp))).toBe(true);
    expect(record.threadId).toBeGreaterThan(0);
    expect(typeof record.threadName === 'string' || record.threadName === null).toBe(true);
    expect(record.level).toBe("d");
    const both = await combined.current();
    expect(both.ok, both.error ?? 'combined capture succeeds').toBe(true);
    expect(both.data.length).toBe(3);
    expect(both.data[both.data.length - 1].tag).toBe('MEU.ApiDemo.Other');
    const stopped = await primary.stop();
    expect(stopped).toEqual(first);
    state.emitDebugLog();
    expect(await primary.stop()).toEqual(stopped);
    expect((await primary.current()).ok).toBe(false);
    const remaining = await combined.stop();
    expect(remaining.ok, remaining.error ?? 'peer remains active').toBe(true);
    expect(remaining.data.length).toBe(both.data.length + 1);
    expect(both.data.length).toBe(3);
  });
  test('capacity does not unregister peer subscriptions', async () => {
    const full = await inspect.log.watch(['MEU.ApiDemo']); watchers.push(full);
    const state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState').getInstance();
    for (let i = 0; i < 10001; i++) state.emitDebugLog();
    const result = await full.current();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('limit');
    expect(result.data.length).toBe(10000);
    const peer = await inspect.log.watch(['MEU.ApiDemo']); watchers.push(peer);
    state.emitDebugLog();
    expect((await peer.stop()).data.length).toBe(1);
    expect((await full.stop()).data.length).toBe(10000);
  });
  test('native worker logs retain their emitting thread and survive subscription churn', async () => {
    const state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture').getInstance();
    const primary = await inspect.log.watch(['MEU.Context']); watchers.push(primary);
    for (let round = 0; round < 10; round++) {
      const peer = await inspect.log.watch(['MEU.Context']); watchers.push(peer);
      state.startWorkers();
      await peer.stop();
      const finished = await drive.waitUntil(() => Number(state.getWorkersDone()) === 2);
      expect(finished.ok, 'Native log workers finish').toBe(true);
    }
    const result = await primary.stop();
    expect(result.ok, result.error).toBe(true);
    expect(result.data.length).toBe(20);
    expect([...new Set(result.data.map(record => record.threadName))].sort()).toEqual(['capture-w1', 'capture-w2']);
  });

  test('concurrent native log bursts survive repeated registration and removal', async () => {
    const state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture').getInstance();
    const primary = await inspect.log.watch(['MEU.Context']); watchers.push(primary);
    state.startLogWorkers(1000);
    for (let i = 0; i < 50; i++) {
      const peer = await inspect.log.watch(['MEU.Context']); watchers.push(peer);
      await peer.stop();
    }
    const completed = await drive.waitUntil(() => Number(state.getWorkersDone()) === 2);
    expect(completed.ok, 'Both native log bursts finish').toBe(true);
    const result = await primary.stop();
    expect(result.ok, result.error).toBe(true);
    expect(result.data.length).toBe(2000);
    expect(new Set(result.data.map(record => record.message)).size).toBe(2000);
  });

});
