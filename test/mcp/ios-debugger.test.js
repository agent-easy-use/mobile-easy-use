import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDebuggerSymbols } from '../../src/ios/debugger/config.js';
import test from 'node:test';
import { closeConnection } from '../../src/mcp-api/utils.js';
import { IOSDebuggerSession, IOS_DEBUGGER_ACTIONS } from '../../src/ios/debugger/session.js';

async function configFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'meu-debugger-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, '.meu'));
  return { directory, configPath: join(directory, '.meu/config.json') };
}

test('symbol config resolves from config directory and preserves order and duplicates', async t => {
  const { configPath } = await configFixture(t);
  assert.deepEqual(await readDebuggerSymbols(configPath), []);
  for (const config of [{}, { ios: { debugger: { dsymPaths: [] } } }]) {
    await writeFile(configPath, JSON.stringify(config));
    assert.deepEqual(await readDebuggerSymbols(configPath), []);
  }
  const paths = ['./symbols/A.dSYM', '/symbols/B.dSYM', './symbols/A.dSYM'];
  await writeFile(configPath, JSON.stringify({ ios: { debugger: { dsymPaths: paths } } }));
  const entries = await readDebuggerSymbols(configPath);
  assert.deepEqual(entries.map(item => item.path), paths);
  assert.equal(entries[0].resolvedPath, join(configPath, '../symbols/A.dSYM'));
  assert.equal(entries[1].resolvedPath, '/symbols/B.dSYM');
  assert.deepEqual(entries[0], entries[2]);
});

test('symbol config rejects malformed shape before starting a debugger', async t => {
  const { configPath } = await configFixture(t);
  for (const config of [null, [], { ios: null }, { ios: { debugger: [] } },
    { ios: { debugger: { dsymPaths: null } } }, { ios: { debugger: { dsymPaths: 'A.dSYM' } } }, { ios: { debugger: { dsymPaths: [''] } } }]) {
    await writeFile(configPath, JSON.stringify(config));
    await assert.rejects(readDebuggerSymbols(configPath), /Invalid|dsymPaths/);
  }
  await writeFile(configPath, '{');
  await assert.rejects(readDebuggerSymbols(configPath), /Invalid config/);
});

test('Host attach reuses the resolved connection device', async (t) => {
  const attach = new Map(IOS_DEBUGGER_ACTIONS).get('ios.debugger.attach');
  const result = { symbolLoadErrors: [] };
  const { directory, configPath } = await configFixture(t);
  t.mock.method(process, 'cwd', () => directory);
  await writeFile(configPath, JSON.stringify({ ios: { debugger: { dsymPaths: ['./App.dSYM'] } } }));
  const start = t.mock.method(IOSDebuggerSession, 'start', async () => ({ attachResult: result }));
  for (const physical of [false, true]) {
    const connection = {
      platform: 'ios', deviceId: 'original-device-name',
      runnerPreparation: { physical, destinationId: 'resolved-udid' },
    };
    const payload = { pid: 123, build: { executable: '/build/App' } };
    assert.equal(await attach(payload, null, null, connection), result);
    assert.deepEqual(start.mock.calls.at(-1).arguments[0], {
      pid: payload.pid, symbols: [{ path: './App.dSYM', resolvedPath: join(directory, '.meu/App.dSYM') }],
      device: { kind: physical ? 'device' : 'simulator', id: 'resolved-udid' },
    });
  }
});

test('disconnect logs iOS debugger failures and continues cleanup', async (t) => {
  const calls = [];
  const logs = [];
  t.mock.method(process.stderr, 'write', text => { logs.push(text); return true; });
  const connection = {
    platform: 'ios', address: 'local',
    iosDebugger: Promise.resolve({ close: async () => { throw new Error('detach failed'); } }),
    sdkScript: {
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
  assert.deepEqual(calls, ['runner.close', 'unload', 'frida.detach', 'removeRemoteDevice']);
  assert.match(logs.join(''), /debugger cleanup failed: detach failed/);
});

test('concurrent LLDB closes share detach and retry after failure', async () => {
  let resolveDetach;
  let requests = 0;
  let ended = 0;
  const session = Object.create(IOSDebuggerSession.prototype);
  session.closed = false;
  session.transport = { end() { ended++; } };
  session.request = () => {
    requests++;
    return new Promise(resolve => { resolveDetach = resolve; });
  };
  const first = session.close();
  assert.equal(session.close(), first);
  assert.equal(session.closed, false);
  resolveDetach();
  await first;
  await session.close();
  assert.equal(requests, 1);
  assert.equal(ended, 1);

  session.closed = false;
  session.closing = undefined;
  session.request = async () => { throw new Error('detach failed'); };
  await assert.rejects(session.close(), /detach failed/);
  assert.equal(session.closed, false);
  session.request = async () => {};
  await session.close();
  assert.equal(session.closed, true);
});
