import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { IOSRunner } from '../src/mcp-api/ios-runner.js';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.signalCode = null;
    queueMicrotask(() => this.emit('spawn'));
  }

  kill(signal) {
    this.signalCode = signal;
    queueMicrotask(() => this.emit('exit', null, signal));
    return true;
  }
}

test('iOS XCTest runner uses its dedicated listen endpoint', async () => {
  const config = JSON.parse(await readFile(
    'runners/ios-xctest/MobileEasyUseRuntime.config',
    'utf8',
  ));

  assert.deepEqual(config.interaction, {
    type: 'listen',
    address: '0.0.0.0',
    port: 8485,
    on_port_conflict: 'fail',
    on_load: 'resume',
  });
  assert.equal(config.code_signing, 'required');
});

test('connection-owned iOS Runner starts, forwards, and closes on a simulator', async () => {
  const spawnCalls = [];
  const remoteAddresses = [];
  const removedAddresses = [];
  const performed = [];
  const boundAppIds = [];
  let statusCalls = 0;
  let unloadCalls = 0;
  let detachCalls = 0;
  const releasedPorts = [];
  const detached = { connect(handler) { this.handler = handler; } };
  const script = {
    isDestroyed: false,
    exports: {
      async bind(appId) {
        boundAppIds.push(appId);
        return {
          available: true,
          platform: 'ios',
          driver: 'xctest',
          appId,
        };
      },
      async status() {
        statusCalls += 1;
        return {
          available: true,
          platform: 'ios',
          driver: 'xctest',
          appId: 'com.example.app',
        };
      },
      async perform(payload) {
        performed.push(payload);
        return { ok: true, action: payload.action, mode: 'semantic' };
      },
    },
    async load() {},
    async unload() { unloadCalls += 1; this.isDestroyed = true; },
  };
  const session = {
    detached,
    isDetached: () => false,
    async createScript(source, options) {
      assert.equal(source, 'runner-bundle');
      assert.deepEqual(options, { name: 'mobile-ios-xctest-driver' });
      return script;
    },
    async detach() { detachCalls += 1; },
  };
  const owner = {
    deviceManager: {
      async addRemoteDevice(address) {
        remoteAddresses.push(address);
        return { async attach(name) { assert.equal(name, 'Gadget'); return session; } };
      },
      async removeRemoteDevice(address) { removedAddresses.push(address); },
    },
  };
  const connection = {
    platform: 'ios',
    deviceId: 'SIM-1',
    appId: 'com.example.app',
    iosRunner: null,
  };
  const runner = new IOSRunner(owner, connection, connection.appId, {
    execute: async () => ({
      stdout: JSON.stringify({
        devices: { runtime: [{ udid: 'SIM-1', name: 'iPhone', state: 'Booted' }] },
      }),
    }),
    spawn(command, args, options) {
      spawnCalls.push({ command, args, options });
      return new FakeChild();
    },
    runnerCli: '/test/mobile-easy-use-ios',
    loadDriver: async () => 'runner-bundle',
    allocatePort: async () => 8485,
    releasePort: (port) => releasedPorts.push(port),
    retryDelayMs: 1,
  });
  await runner.startRuntime();
  connection.iosRunner = runner;

  assert.deepEqual(await runner.perform({
    action: 'click', target: { type: 'identifier', value: 'login' },
  }), { ok: true, action: 'click', mode: 'semantic' });

  assert.deepEqual(spawnCalls, [{
    command: '/test/mobile-easy-use-ios',
    args: ['runner', '--simulator', 'SIM-1', '--port', '8485'],
    options: { stdio: ['ignore', 'pipe', 'pipe'] },
  }]);
  assert.deepEqual(remoteAddresses, ['127.0.0.1:8485']);
  assert.deepEqual(boundAppIds, ['com.example.app']);
  assert.equal(statusCalls, 2);
  assert.equal(performed.length, 1);

  await runner.close();
  assert.equal(unloadCalls, 1);
  assert.equal(detachCalls, 1);
  assert.deepEqual(removedAddresses, ['127.0.0.1:8485']);
  assert.deepEqual(releasedPorts, [8485]);
  assert.equal(spawnCalls[0].command.length > 0, true);
});
