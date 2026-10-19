import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { closeConnection } from '../src/mcp-api/utils.js';
import { IOSDebuggerSession, IOS_DEBUGGER_ACTIONS } from '../src/ios/debugger/session.js';

async function fixture(build = null, attachResult = { symbolSource: 'lldb' }) {
  const requests = [];
  const records = [{ hitId: 'h1', observations: { price: 100 }, errors: [] }];
  const context = vm.createContext({ Process: { id: 123 } });
  const source = await readFile(new URL('../sdk/ios/probe/debugger.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => {
    const exports = specifier.includes('controller') ? { requestController: async (action, payload) => {
      requests.push({ action, payload });
      return { ok: true, responsePayload: action.endsWith('remove') ? records : action.endsWith('attach') ? attachResult : null };
    } } : { default: { classes: {
      NSBundle: { mainBundle: () => ({ pathForResource_ofType_: () => build ? '/App/MobileEasyUseDebug.plist' : null }) },
      NSDictionary: { dictionaryWithContentsOfFile_: () => ({ objectForKey_: key => build[key] ?? null }) },
    } } };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, requests, records };
}

test('expression strings pass unchanged; concurrent stop shares the remove reply', async () => {
  const { api, requests, records } = await fixture();
  await api.attachDebugger();
  assert.deepEqual(Object.keys(requests[0].payload).sort(), ['build', 'pid']);
  assert.equal(requests[0].payload.pid, 123);
  const code = '{ func f(_ x: Int) -> Int { x * 2 }; return f(price) }()';
  const stop = await api.installDebugger({
    breakpoint: { kind: 'source', file: '/project/Price.swift', line: 42, condition: 'price > 0' },
    stack: 3, observations: { before: 'price', computed: code }, overrides: { price: '42' }, earlyReturn: 'price',
  });
  const definition = requests[1].payload.definition;
  assert.equal(definition.observations.computed, code);
  assert.equal(definition.breakpoint.condition, 'price > 0');
  assert.equal(definition.stack, 3);
  assert.deepEqual(await Promise.all([stop(), stop()]), [records, records]);
  assert.equal(requests.filter(r => r.action.endsWith('remove')).length, 1);
  await api.detachDebugger();
  assert.equal(await stop(), records);
});

test('rejects non-code values; records must be collected before detach', async () => {
  const { api } = await fixture();
  await assert.rejects(api.installDebugger({}), /attach/);
  await api.attachDebugger();
  const breakpoint = { kind: 'address', address: '0x123' };
  for (const observations of [[], { value: () => 1 }, { value: { kind: 'local', name: 'price' } }]) {
    await assert.rejects(api.installDebugger({ breakpoint, observations }));
  }
  const stop = await api.installDebugger({ breakpoint, stack: 2 });
  await api.detachDebugger();
  await assert.rejects(stop(), /ended/);
  await api.disposeDebugger();
});

test('attach forwards optional plist symbol paths', async () => {
  const build = { dsymPath: '/build/App.dSYM', executable: '/build/App.app/App' };
  const { api, requests } = await fixture(build);
  await api.attachDebugger();
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].payload.build)), build);
});

test('attach returns the symbol discovery route', async () => {
  for (const symbolSource of ['lldb', 'dsymPath', 'executable']) {
    const result = { symbolSource };
    const { api } = await fixture(null, result);
    assert.equal(await api.attachDebugger(), result);
  }
});

test('Host attach reuses the resolved connection device', async (t) => {
  const attach = new Map(IOS_DEBUGGER_ACTIONS).get('ios.debugger.attach');
  const result = { symbolSource: 'lldb' };
  const start = t.mock.method(IOSDebuggerSession, 'start', async () => ({ attachResult: result }));
  for (const physical of [false, true]) {
    const connection = {
      platform: 'ios', deviceId: 'original-device-name',
      runnerPreparation: { physical, destinationId: 'resolved-udid' },
    };
    const payload = { pid: 123, build: { executable: '/build/App' } };
    assert.equal(await attach(payload, null, null, connection), result);
    assert.deepEqual(start.mock.calls.at(-1).arguments[0], {
      ...payload, device: { kind: physical ? 'device' : 'simulator', id: 'resolved-udid' },
    });
  }
});

test('disconnect logs iOS debugger/disposal failures and continues cleanup', async (t) => {
  const calls = [];
  const logs = [];
  t.mock.method(process.stderr, 'write', text => { logs.push(text); return true; });
  const connection = {
    platform: 'ios', address: 'local',
    iosDebugger: Promise.resolve({ close: async () => { throw new Error('detach failed'); } }),
    sdkScript: {
      exports: { dispose: async () => {
        calls.push('dispose');
        throw new Error('SDK detach failed');
      } },
      unload: async () => calls.push('unload'),
    },
    iosRunner: { close: async () => calls.push('runner.close') },
    session: { detach: async () => calls.push('frida.detach') },
  };
  const owner = {
    currentConnection: connection, state: 'connected',
    deviceManager: { removeRemoteDevice: async () => calls.push('removeRemoteDevice') },
  };
  await closeConnection(owner, connection);
  assert.equal(owner.state, 'disconnected');
  assert.equal(owner.currentConnection, null);
  assert.deepEqual(calls, ['dispose', 'runner.close', 'unload', 'frida.detach', 'removeRemoteDevice']);
  assert.match(logs.join(''), /debugger cleanup failed: detach failed/);
  assert.match(logs.join(''), /SDK disposal failed: SDK detach failed/);
});
