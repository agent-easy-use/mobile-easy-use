import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GadgetConnection } from '../src/mcp-api/api.js';
import { IOSSigningError } from '../src/mcp-api/ios-signing.js';

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function fileModulePath(filePath, source) {
  return `${realpathSync(filePath)}?sha256=${sha256(source)}`;
}

function createProbeFile(source) {
  const directory = mkdtempSync(join(tmpdir(), 'mobile-easy-use-call-'));
  const filePath = join(directory, 'probe.js');
  writeFileSync(filePath, source, 'utf8');
  return filePath;
}

function targetInput(overrides = {}) {
  return {
    platform: 'android',
    deviceId: 'device-1',
    appId: 'com.example.app',
    runtimePort: 8484,
    ip: '127.0.0.1',
    port: 18484,
    ...overrides,
  };
}

class FakeSignal {
  connect(handler) {
    this.handler = handler;
  }

  emit(...args) {
    return this.handler?.(...args);
  }
}

class FakeScript {
  constructor() {
    this.destroyed = new FakeSignal();
    this.message = new FakeSignal();
    this.isDestroyed = false;
    this.loadCalls = 0;
    this.unloadCalls = 0;
    this.loadError = null;
    this.exports = {};
    this.postCalls = [];
  }

  async load() {
    this.loadCalls += 1;
    if (this.loadError !== null) {
      throw this.loadError;
    }
  }

  async unload() {
    this.unloadCalls += 1;
    this.isDestroyed = true;
    this.destroyed.emit();
  }

  post(message) {
    this.postCalls.push(message);
  }
}

class FakeDeviceManager {
  constructor() {
    this.detached = new FakeSignal();
    this.addresses = [];
    this.targets = [];
    this.removed = [];
    this.createdScripts = [];
    this.scriptLogs = [];
    this.presetBundles = [];
    this.loadedModules = [];
    this.functionCalls = [];
    this.functionLogs = [];
    this.functionMessages = [];
    this.functionResult = null;
    this.functionCallError = null;
    this.evalCalls = [];
    this.evalLogs = [];
    this.evalMessages = [];
    this.evalResult = null;
    this.evalError = null;
    this.moduleLoadError = null;
    this.presetLoadError = null;
    this.sdkLoadError = null;
    this.runtimeStatus = {
      platform: 'android',
      available: true,
      appId: 'com.example.app',
    };
    this.runtimeStatusCalls = 0;
    this.sessionDetached = false;
    this.session = {
      detached: this.detached,
      isDetached: () => this.sessionDetached,
      detach: async () => {
        this.sessionDetached = true;
      },
      createScript: async (source, options) => {
        const script = new FakeScript();
        script.loadError = this.sdkLoadError;
        script.exports.loadPresetBundle = async (modulePath, source) => {
          if (this.presetLoadError !== null) {
            throw this.presetLoadError;
          }
          this.presetBundles.push({ modulePath, source });
        };
        script.exports.callFunction = async (modulePath, moduleSource, functionName, args) => {
          if (!this.loadedModules.some((module) => module.modulePath === modulePath)) {
            if (this.moduleLoadError !== null) {
              throw this.moduleLoadError;
            }
            this.loadedModules.push({ modulePath, source: moduleSource });
          }
          this.functionCalls.push({ modulePath, functionName, args });
          for (const [level, text] of this.functionLogs) {
            script.logHandler(level, text);
          }
          for (const [message, data] of this.functionMessages) {
            await script.message.emit(message, data);
          }
          if (this.functionCallError !== null) {
            throw this.functionCallError;
          }
          return this.functionResult;
        };
        script.exports.evalScript = async (scriptName, source) => {
          this.evalCalls.push({ scriptName, source });
          for (const [level, text] of this.evalLogs) {
            script.logHandler(level, text);
          }
          for (const [message, data] of this.evalMessages) {
            await script.message.emit(message, data);
          }
          if (this.evalError !== null) {
            throw this.evalError;
          }
          return this.evalResult;
        };
        script.exports.runtimeStatus = async () => {
          this.runtimeStatusCalls += 1;
          return this.runtimeStatus;
        };
        this.createdScripts.push({ source, options, script });
        return script;
      },
    };
    this.device = {
      attach: async (target) => {
        this.targets.push(target);
        return this.session;
      },
    };
  }

  async addRemoteDevice(address) {
    this.addresses.push(address);
    return this.device;
  }

  async removeRemoteDevice(address) {
    this.removed.push(address);
  }
}

test('connect uses the complete target and Host endpoint', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager, {
    createConnectionId: () => 'connection-1',
  });

  const result = await connection.connect(targetInput({
    port: 19484,
  }));

  assert.deepEqual(manager.addresses, ['127.0.0.1:19484']);
  assert.deepEqual(manager.targets, ['Gadget']);
  assert.equal(manager.createdScripts.length, 1);
  assert.deepEqual(manager.createdScripts[0].options, { name: 'mobile-android-sdk' });
  assert.equal(manager.createdScripts[0].script.loadCalls, 1);
  assert.equal(manager.loadedModules.length, 0);
  assert.match(manager.createdScripts[0].source, /^📦\n/);
  assert.match(manager.createdScripts[0].source, /\/sdk\/android\/index\.js/);
  assert.match(manager.createdScripts[0].source, /frida-java-bridge/);
  assert.equal(manager.runtimeStatusCalls, 1);
  assert.deepEqual(result, {
    connected: true,
    state: 'connected',
    target: {
      platform: 'android',
      deviceId: 'device-1',
      appId: 'com.example.app',
      runtimePort: 8484,
    },
    ip: '127.0.0.1',
    port: 19484,
    fridaTarget: 'Gadget',
  });
});

test('connect loads a built preset ES module when it exists', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager, {
    loadPresets: async () => 'built preset ES module',
  });

  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  assert.deepEqual(manager.presetBundles, [{
    modulePath: '/docs/mobile-easy-use/presets.js',
    source: 'built preset ES module',
  }]);
});

test('connect skips presets when the bundle does not exist', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager, {
    loadPresets: async () => null,
  });

  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  assert.deepEqual(manager.presetBundles, []);
});

test('failed preset loading resets the connection', async () => {
  const manager = new FakeDeviceManager();
  manager.presetLoadError = new Error('invalid preset ES module');
  const connection = new GadgetConnection(manager, {
    loadPresets: async () => 'broken preset ES module',
  });

  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1' })),
    /invalid preset ES module/,
  );

  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.equal(manager.createdScripts[0].script.unloadCalls, 1);
  assert.equal(manager.sessionDetached, true);
});

test('connect reuses the same healthy target even when a new endpoint is supplied', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  const first = await connection.connect(targetInput({ ip: '127.0.0.1', port: 18484 }));
  const connectionId = connection.getConnectionId();

  const reused = await connection.connect(targetInput({ ip: '127.0.0.1', port: 19484 }));

  assert.deepEqual(reused, first);
  assert.equal(connection.getConnectionId(), connectionId);
  assert.deepEqual(manager.addresses, ['127.0.0.1:18484']);
  assert.equal(manager.createdScripts.length, 1);
  assert.equal(manager.loadedModules.length, 0);
  assert.equal(manager.runtimeStatusCalls, 2);
});

test('iOS connect loads before a real connection and skips loading on reuse', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus = {
    platform: 'ios',
    available: true,
    appId: 'com.example.app',
  };
  const events = [];
  const addRemoteDevice = manager.addRemoteDevice.bind(manager);
  manager.addRemoteDevice = async (address) => {
    events.push('connect');
    return addRemoteDevice(address);
  };
  const runner = { closing: false, async close() {} };
  const connection = new GadgetConnection(manager, {
    prepareIOSRunner: async () => { events.push('prepare'); return { physical: false, signing: null }; },
    loadIOSAppRuntime: async ({ deviceId, appId }) => {
      events.push(`load:${deviceId}:${appId}`);
    },
    startIOSRunner: async () => {
      events.push('runner');
      return runner;
    },
  });
  const input = targetInput({ platform: 'ios' });

  const first = await connection.connect(input);
  const reused = await connection.connect({ ...input, port: 19484 });

  assert.deepEqual(reused, first);
  assert.deepEqual(events, [
    'prepare',
    'load:device-1:com.example.app',
    'connect',
    'runner',
  ]);
  assert.equal(manager.runtimeStatusCalls, 2);
});

test('iOS Loader failure aborts before creating a Frida connection', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager, {
    prepareIOSRunner: async () => ({ physical: false, signing: null }),
    loadIOSAppRuntime: async () => {
      throw new Error('LLDB load failed');
    },
  });

  await assert.rejects(
    connection.connect(targetInput({ platform: 'ios' })),
    /Failed to connect.*LLDB load failed/,
  );

  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.deepEqual(manager.addresses, []);
  assert.deepEqual(manager.targets, []);
});

test('missing iOS signing configuration fails before the Loader', async () => {
  const manager = new FakeDeviceManager();
  let loaded = false;
  const error = new IOSSigningError('IOS_SIGNING_SETUP_REQUIRED', 'Run to-ios-integrate');
  const connection = new GadgetConnection(manager, {
    prepareIOSRunner: async () => { throw error; },
    loadIOSAppRuntime: async () => { loaded = true; },
  });
  await assert.rejects(connection.connect(targetInput({ platform: 'ios' })), actual => actual === error);
  assert.equal(loaded, false);
  assert.deepEqual(manager.addresses, []);
  assert.equal(connection.state, 'disconnected');
});

test('iOS connect reuses prepared signing without persisting configuration', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus = { platform: 'ios', available: true, appId: 'com.example.app' };
  const events = [];
  let fail = true;
  const connection = new GadgetConnection(manager, {
    prepareIOSRunner: async () => ({ physical: true, signing: {
      teamId: 'AAAAAAAAAA', bundleId: 'com.example.runner', remember: async () => events.push('remember'),
    } }),
    loadIOSAppRuntime: async () => {},
    startIOSRunner: async () => { if (fail) throw new Error('signing failed'); events.push('runner'); return { closing: false, async close() {} }; },
  });
  const input = targetInput({ platform: 'ios' });
  await assert.rejects(connection.connect(input), /signing failed/);
  assert.deepEqual(events, []);
  fail = false;
  manager.sessionDetached = false; // Model a fresh attach after the failed connection was cleaned up.
  await connection.connect(input);
  assert.deepEqual(events, ['runner']);
  await connection.connect(input);
  assert.deepEqual(events, ['runner']);
  assert.equal(connection.state, 'connected');
});

test('connect identity is deviceId plus appId and reuses a healthy instance across ports', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  const first = await connection.connect(targetInput({
    runtimePort: 8484,
    port: 18484,
  }));
  const connectionId = connection.getConnectionId();

  const reused = await connection.connect(targetInput({
    runtimePort: 9484,
    port: 19484,
  }));

  assert.deepEqual(reused, first);
  assert.equal(connection.getConnectionId(), connectionId);
  assert.deepEqual(manager.addresses, ['127.0.0.1:18484']);
  assert.equal(manager.createdScripts.length, 1);
  assert.equal(manager.runtimeStatusCalls, 2);
});

test('connect rejects a platform conflict without closing the healthy instance', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput());

  await assert.rejects(
    connection.connect(targetInput({ platform: 'ios' })),
    /already uses platform "android"/,
  );

  assert.equal(connection.state, 'connected');
  assert.notEqual(connection.currentConnection, null);
  assert.equal(manager.createdScripts[0].script.unloadCalls, 0);
  assert.deepEqual(manager.removed, []);
});

test('connect rejects a runtime owned by another App', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus.appId = 'com.example.other';
  const connection = new GadgetConnection(manager);

  await assert.rejects(
    connection.connect(targetInput()),
    /runtime port 8484 is already occupied by another App.*expected appId "com\.example\.app".*connected appId "com\.example\.other"/,
  );

  assert.equal(manager.runtimeStatusCalls, 1);
  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.equal(manager.createdScripts[0].script.unloadCalls, 1);
  assert.equal(manager.sessionDetached, true);
});

test('connect revalidates appId before reusing the same target', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput());
  manager.runtimeStatus.appId = 'com.example.other';

  await assert.rejects(
    connection.connect(targetInput({ runtimePort: 9484, port: 19484 })),
    /runtime port 8484 is already occupied by another App.*connected appId "com\.example\.other"/,
  );

  assert.equal(manager.runtimeStatusCalls, 2);
  assert.equal(manager.createdScripts.length, 1);
  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.equal(manager.createdScripts[0].script.unloadCalls, 1);
  assert.deepEqual(manager.removed, ['127.0.0.1:18484']);
});

test('connect replaces the single connection when the target changes', async () => {
  const manager = new FakeDeviceManager();
  let nextConnectionId = 1;
  const connection = new GadgetConnection(manager, {
    createConnectionId: () => `connection-${nextConnectionId++}`,
  });

  await connection.connect(targetInput({ ip: '127.0.0.1', port: 18484 }));
  const firstScript = manager.createdScripts[0].script;
  manager.sessionDetached = false;
  manager.runtimeStatus.appId = 'com.example.other';

  const changedTarget = await connection.connect(targetInput({
    appId: 'com.example.other',
    ip: '127.0.0.1',
    port: 19484,
  }));
  assert.equal(changedTarget.target.appId, 'com.example.other');
  assert.equal(connection.getConnectionId(), 'connection-2');
  assert.equal(firstScript.unloadCalls, 1);
  assert.deepEqual(manager.addresses, [
    '127.0.0.1:18484',
    '127.0.0.1:19484',
  ]);
});

test('connect replaces a stale connection to the same endpoint', async () => {
  const manager = new FakeDeviceManager();
  let nextConnectionId = 1;
  const connection = new GadgetConnection(manager, {
    createConnectionId: () => `connection-${nextConnectionId++}`,
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const firstConnectionId = connection.getConnectionId();
  const staleScript = manager.createdScripts[0].script;
  manager.sessionDetached = true;
  manager.device.attach = async (target) => {
    manager.targets.push(target);
    manager.sessionDetached = false;
    return manager.session;
  };

  const result = await connection.connect(targetInput({ ip: '127.0.0.1' }));

  assert.equal(result.connected, true);
  assert.equal(firstConnectionId, 'connection-1');
  assert.equal(connection.getConnectionId(), 'connection-2');
  assert.deepEqual(manager.addresses, ['127.0.0.1:18484', '127.0.0.1:18484']);
  assert.deepEqual(manager.removed, ['127.0.0.1:18484']);
  assert.equal(staleScript.unloadCalls, 1);
  assert.equal(manager.createdScripts.length, 2);
});

test('disconnect destroys the shared runtime and is idempotent', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const script = manager.createdScripts[0].script;

  const result = await connection.disconnect();
  const repeated = await connection.disconnect();

  assert.deepEqual(result, { connected: false, state: 'disconnected' });
  assert.deepEqual(repeated, result);
  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.equal(script.unloadCalls, 1);
  assert.equal(manager.sessionDetached, true);
  assert.deepEqual(manager.removed, ['127.0.0.1:18484']);
});

test('connect requires a complete target and local endpoint', async () => {
  const connection = new GadgetConnection(new FakeDeviceManager());

  await assert.rejects(
    connection.connect(targetInput({ platform: undefined })),
    /platform must be android or ios/,
  );
  await assert.rejects(
    connection.connect(targetInput({ runtimePort: undefined })),
    /between 1 and 65535/,
  );
  await assert.rejects(
    connection.connect(targetInput({ port: undefined })),
    /between 1 and 65535/,
  );
  await assert.rejects(connection.connect(targetInput({ ip: 'phone.local' })), /valid IPv4/);
  await assert.rejects(
    connection.connect(targetInput({ ip: '192.168.1.2' })),
    /remote endpoints are not supported/,
  );
  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1', port: 0 })),
    /between 1 and 65535/,
  );
  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1', appId: '' })),
    /appId must be a non-empty string/,
  );
});

test('session detach clears the unique current connection and removes the local endpoint', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  manager.detached.emit('connection-terminated', null);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.deepEqual(manager.removed, ['127.0.0.1:18484']);
});

test('failed attach resets state and removes the local endpoint', async () => {
  const manager = new FakeDeviceManager();
  manager.device.attach = async () => {
    throw new Error('process not found');
  };
  const connection = new GadgetConnection(manager);

  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1' })),
    /Failed to connect.*process not found/,
  );
  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.deepEqual(manager.removed, ['127.0.0.1:18484']);
});

test('callFunction loads a file and calls an exported function', async () => {
  const manager = new FakeDeviceManager();
  manager.functionResult = { greeting: 'hello Codex' };
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const source = 'export function greet(name) { return `hello ${name}`; }';
  const filePath = createProbeFile(source);
  const modulePath = fileModulePath(filePath, source);

  const result = await connection.callFunction({
    filePath,
    functionName: 'greet',
    args: ['Codex'],
  });

  assert.deepEqual(manager.functionCalls, [{
    modulePath,
    functionName: 'greet',
    args: ['Codex'],
  }]);
  assert.deepEqual(result, {
    result: { greeting: 'hello Codex' },
    evidence: [],
  });
});

test('evalScript evaluates an inline async IIFE in the shared SDK runtime', async () => {
  const manager = new FakeDeviceManager();
  manager.evalResult = { platform: 'android', available: true };
  const connection = new GadgetConnection(manager, {
    createEvalId: () => 'eval-1',
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const source = `(async () => {
    return runtimeStatus();
  })()`;

  const result = await connection.evalScript({ source });

  assert.deepEqual(manager.evalCalls, [{
    scriptName: '/eval/eval-1.js',
    source,
  }]);
  assert.deepEqual(result, {
    result: { platform: 'android', available: true },
    evidence: [],
  });
});

test('evalScript validates the async IIFE shape and normalizes undefined', async () => {
  const manager = new FakeDeviceManager();
  manager.evalResult = undefined;
  const connection = new GadgetConnection(manager, {
    createEvalId: () => 'eval-2',
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  const result = await connection.evalScript({
    source: '  ( async ( ) => { return undefined; } ) ( ) ;  ',
  });
  assert.deepEqual(result, { result: null, evidence: [] });

  for (const source of [
    '',
    'return runtimeStatus();',
    'runtimeStatus();',
    '(() => runtimeStatus())()',
    'const run = async () => runtimeStatus(); run();',
  ]) {
    await assert.rejects(
      connection.evalScript({ source }),
      /source must be a non-empty string|source must be an async IIFE/,
    );
  }
});

test('evalScript aggregates action-scoped evidence', async () => {
  const manager = new FakeDeviceManager();
  manager.evalResult = { ok: true };
  manager.evalLogs = [
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"SearchState#query","actionDescription":"Inspect query","checkpoint":"before","value":"Cat"}}'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"SearchState#query","actionDescription":"Inspect query","checkpoint":"after","value":"Cat"}}'],
  ];
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-eval-evidence-'));
  const connection = new GadgetConnection(manager, {
    createEvalId: () => 'eval-evidence',
    createEvidenceId: () => 'eval-evidence-result',
    evidenceDirectory,
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  const result = await connection.evalScript({
    source: '(async () => { return { ok: true }; })()',
  });

  assert.deepEqual(result.evidence, [{
    actionDescription: 'Inspect query',
    evidencePath: join(evidenceDirectory, 'eval-evidence-result.json'),
  }]);
  const evidence = JSON.parse(readFileSync(result.evidence[0].evidencePath, 'utf8'));
  assert.equal(evidence.actionDescription, 'Inspect query');
  assert.equal(evidence.state['SearchState#query'].changed, false);
  assert.equal(Object.hasOwn(evidence.state['SearchState#query'], 'actionDescription'), false);
});

test('evalScript rejects concurrent operations and clears its active call after failure', async () => {
  const manager = new FakeDeviceManager();
  let finishEval;
  manager.evalResult = new Promise((resolve) => {
    finishEval = resolve;
  });
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-eval-failure-evidence-'));
  const connection = new GadgetConnection(manager, {
    evidenceDirectory,
    createEvidenceId: () => 'eval-failure',
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const source = '(async () => { return true; })()';

  const firstEval = connection.evalScript({ source });
  await assert.rejects(
    connection.evalScript({ source }),
    /Another operation is already running/,
  );
  finishEval(true);
  await firstEval;

  manager.evalLogs = [
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"SearchState#query","actionDescription":"Inspect before failure","checkpoint":"before","value":"Cat"}}'],
  ];
  manager.evalError = new Error('syntax error');
  manager.evalError.stack = 'Error: syntax error\n    at inspect (/eval/source.js:4:9)';
  const failure = await connection.evalScript({ source }).catch((error) => error);
  assert.match(failure.message, /Failed to evaluate script: syntax error/);
  assert.match(failure.stack, /at inspect \(\/eval\/source\.js:4:9\)/);
  assert.deepEqual(failure.evidence, [{
    actionDescription: 'Inspect before failure',
    evidencePath: join(evidenceDirectory, 'eval-failure.json'),
  }]);
  assert.equal(JSON.parse(readFileSync(failure.evidence[0].evidencePath, 'utf8'))
    .state['SearchState#query'].before, 'Cat');
  manager.evalError = null;
  manager.evalLogs = [];
  manager.evalResult = true;
  await connection.evalScript({ source });
});

test('callFunction reuses unchanged modules and loads changed content as a new version', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const filePath = createProbeFile('export function run() { return 1; }');

  await connection.callFunction({ filePath, functionName: 'run' });
  await connection.callFunction({ filePath, functionName: 'run' });
  assert.equal(manager.loadedModules.length, 1);

  writeFileSync(filePath, 'export function run() { return 2; }', 'utf8');
  await connection.callFunction({ filePath, functionName: 'run' });
  assert.equal(manager.loadedModules.length, 2);
  assert.notEqual(manager.loadedModules[0].modulePath, manager.loadedModules[1].modulePath);
});

test('callFunction can load corrected content after a failed version', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const filePath = createProbeFile('export function broken( {');
  manager.moduleLoadError = new Error('syntax error');

  await assert.rejects(
    connection.callFunction({ filePath, functionName: 'run' }),
    /syntax error/,
  );

  manager.moduleLoadError = null;
  writeFileSync(filePath, 'export function run() { return true; }', 'utf8');
  await connection.callFunction({ filePath, functionName: 'run' });
  assert.equal(manager.loadedModules.length, 1);
});

test('callFunction writes one aggregated evidence file per action', async () => {
  const manager = new FakeDeviceManager();
  manager.functionResult = { ok: true };
  manager.functionLogs = [
    ['info', 'ordinary log'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"SearchState#query","actionDescription":"Enter Cat","checkpoint":"before","value":""}}'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"chain","payload":{"type":"method","actionDescription":"Open search","method":"open","phase":"enter"}}'],
    ['info', '@@MOBILE_EVIDENCE@@not-json'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"ui","payload":{"uiKey":"search_input","className":null,"actionDescription":"Open search","checkpoint":"before","value":{"exist":false}}}'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"ui","payload":{"uiKey":"search_input","className":"android.widget.EditText","actionDescription":"Open search","checkpoint":"after","value":{"exist":true}}}'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"SearchState#query","actionDescription":"Enter Cat","checkpoint":"after","value":"Cat"}}'],
  ];
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-evidence-'));
  let nextEvidenceId = 1;
  const connection = new GadgetConnection(manager, {
    evidenceDirectory,
    createEvidenceId: () => `evidence-${nextEvidenceId++}`,
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const filePath = createProbeFile('export function run() {}');

  const result = await connection.callFunction({
    filePath,
    functionName: 'run',
  });

  assert.deepEqual(result, {
    result: { ok: true },
    evidence: [
      {
        actionDescription: 'Enter Cat',
        evidencePath: join(evidenceDirectory, 'evidence-1.json'),
      },
      {
        actionDescription: 'Open search',
        evidencePath: join(evidenceDirectory, 'evidence-2.json'),
      },
    ],
  });
  assert.deepEqual(JSON.parse(readFileSync(result.evidence[0].evidencePath, 'utf8')), {
    actionDescription: 'Enter Cat',
    chain: [],
    ui: {},
    state: {
      'SearchState#query': {
        path: 'SearchState#query',
        before: '',
        after: 'Cat',
        changed: true,
      },
    },
  });
  assert.deepEqual(JSON.parse(readFileSync(result.evidence[1].evidencePath, 'utf8')), {
    actionDescription: 'Open search',
    chain: [{
      type: 'method',
      method: 'open',
      phase: 'enter',
    }],
    ui: {
      search_input: {
        className: 'android.widget.EditText',
        before: { exist: false },
        after: { exist: true },
        changed: true,
      },
    },
    state: {},
  });
});

test('callFunction nests Window and element screenshots in UI checkpoints', async () => {
  const manager = new FakeDeviceManager();
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-screenshot-evidence-'));
  const evidenceLog = (checkpoint, value, uiKey = 'searchInput') => ['info', `@@MOBILE_EVIDENCE@@${JSON.stringify({
    category: 'ui',
    payload: {
      actionDescription: 'Open search',
      checkpoint,
      uiKey,
      className: 'android.widget.EditText',
      value,
    },
  })}`];
  manager.functionLogs = [
    evidenceLog('before', {
      exist: false,
      visible: false,
      bounds: null,
      properties: {},
      screenshots: {
        window: join(evidenceDirectory, 'screenshot-1.jpg'),
        element: null,
      },
    }),
    evidenceLog('after', {
      exist: true,
      visible: true,
      bounds: { x: 10, y: 20, width: 30, height: 40 },
      properties: {},
      screenshots: {
        window: join(evidenceDirectory, 'screenshot-2.jpg'),
        element: join(evidenceDirectory, 'screenshot-3.jpg'),
      },
    }),
    evidenceLog('before', {
      exist: true,
      visible: true,
      screenshots: { window: join(evidenceDirectory, 'screenshot-1.jpg'), element: null },
    }, 'stableLabel'),
    evidenceLog('after', {
      exist: true,
      visible: true,
      screenshots: { window: join(evidenceDirectory, 'screenshot-2.jpg'), element: null },
    }, 'stableLabel'),
  ];
  const fileWriteMessage = (requestId, filePath) => [{
    type: 'send',
    payload: {
      source: 'mobile-easy-use',
      channel: 'controller.request',
      payload: {
        requestId,
        action: 'file.write',
        payload: { filePath },
      },
    },
  }, image];
  manager.functionMessages = [
    fileWriteMessage('before-window', 'screenshot-1.jpg'),
    fileWriteMessage('after-window', 'screenshot-2.jpg'),
    fileWriteMessage('after-element', 'screenshot-3.jpg'),
  ];
  let nextEvidenceId = 1;
  const connection = new GadgetConnection(manager, {
    evidenceDirectory,
    createEvidenceId: () => `screenshot-${nextEvidenceId++}`,
  });
  await connection.connect(targetInput());

  const result = await connection.callFunction({
    filePath: createProbeFile('export function run() {}'),
    functionName: 'run',
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].evidencePath, join(evidenceDirectory, 'screenshot-1.json'));
  assert.equal(Object.hasOwn(result.evidence[0], 'screenshots'), false);
  const manifest = JSON.parse(readFileSync(result.evidence[0].evidencePath, 'utf8'));
  assert.equal(manifest.actionDescription, 'Open search');
  assert.equal(Object.hasOwn(manifest, 'screenshots'), false);
  const before = manifest.ui.searchInput.before.screenshots;
  const after = manifest.ui.searchInput.after.screenshots;
  assert.equal(before.window, join(evidenceDirectory, 'screenshot-1.jpg'));
  assert.equal(before.element, null);
  assert.equal(after.window, join(evidenceDirectory, 'screenshot-2.jpg'));
  assert.equal(after.element, join(evidenceDirectory, 'screenshot-3.jpg'));
  assert.deepEqual(readFileSync(after.element), image);
  assert.equal(manifest.ui.searchInput.changed, true);
  assert.equal(manifest.ui.stableLabel.changed, false);
  assert.deepEqual(
    manager.createdScripts[0].script.postCalls.map((message) => ({
      type: message.type,
      response: message.payload,
    })),
    [
      {
        type: 'mobile-easy-use.controller.response.before-window',
        response: { ok: true, responsePayload: { filePath: before.window } },
      },
      {
        type: 'mobile-easy-use.controller.response.after-window',
        response: { ok: true, responsePayload: { filePath: after.window } },
      },
      {
        type: 'mobile-easy-use.controller.response.after-element',
        response: { ok: true, responsePayload: { filePath: after.element } },
      },
    ],
  );
});

test('callFunction returns a fixed Controller response when file.write has no blob', async () => {
  const manager = new FakeDeviceManager();
  manager.functionMessages = [[{
    type: 'send',
    payload: {
      source: 'mobile-easy-use',
      channel: 'controller.request',
      payload: {
        requestId: 'empty-window',
        action: 'file.write',
        payload: { filePath: 'empty-screenshot.jpg' },
      },
    },
  }, null]];
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-empty-screenshot-evidence-'));
  const connection = new GadgetConnection(manager, {
    evidenceDirectory,
    createEvidenceId: () => 'empty-screenshot',
  });
  await connection.connect(targetInput());

  const result = await connection.callFunction({
    filePath: createProbeFile('export function run() {}'),
    functionName: 'run',
  });

  assert.deepEqual(result.evidence, []);
  assert.deepEqual(manager.createdScripts[0].script.postCalls, [{
    type: 'mobile-easy-use.controller.response.empty-window',
    payload: {
      ok: false,
      responsePayload: { error: { message: 'file.write payload.blob is required' } },
    },
  }]);
});

test('callFunction preserves stack and evidence when the export throws', async () => {
  const manager = new FakeDeviceManager();
  manager.functionLogs = [
    ['info', '@@MOBILE_EVIDENCE@@{"category":"chain","payload":{"type":"method","actionDescription":"Invoke failing export","method":"run","phase":"enter"}}'],
  ];
  manager.functionCallError = new Error('export failed');
  manager.functionCallError.stack = 'Error: export failed\n    at run (/probe/module.js:7:3)';
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-call-failure-evidence-'));
  const connection = new GadgetConnection(manager, {
    evidenceDirectory,
    createEvidenceId: () => 'call-failure',
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  const failure = await connection.callFunction({
    filePath: createProbeFile('export function run() {}'),
    functionName: 'run',
  }).catch((error) => error);

  assert.match(failure.message, /Failed to call function: export failed/);
  assert.match(failure.stack, /at run \(\/probe\/module\.js:7:3\)/);
  assert.deepEqual(failure.evidence, [{
    actionDescription: 'Invoke failing export',
    evidencePath: join(evidenceDirectory, 'call-failure.json'),
  }]);
});

test('callFunction safely aggregates special evidence keys', async () => {
  const manager = new FakeDeviceManager();
  manager.functionLogs = [
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"__proto__","actionDescription":"Inspect special path","checkpoint":"before","value":"old"}}'],
    ['info', '@@MOBILE_EVIDENCE@@{"category":"state","payload":{"path":"__proto__","actionDescription":"Inspect special path","checkpoint":"after","value":"new"}}'],
  ];
  const prototypeDescriptors = {
    before: Object.getOwnPropertyDescriptor(Object.prototype, 'before'),
    after: Object.getOwnPropertyDescriptor(Object.prototype, 'after'),
    changed: Object.getOwnPropertyDescriptor(Object.prototype, 'changed'),
  };
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-evidence-special-key-'));
  const connection = new GadgetConnection(manager, {
    evidenceDirectory,
    createEvidenceId: () => 'evidence-special-key',
  });
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const filePath = createProbeFile('export function run() {}');

  const result = await connection.callFunction({ filePath, functionName: 'run' });
  const evidence = JSON.parse(readFileSync(result.evidence[0].evidencePath, 'utf8'));

  assert.equal(Object.hasOwn(evidence.state, '__proto__'), true);
  assert.equal(evidence.actionDescription, 'Inspect special path');
  assert.deepEqual(evidence.state.__proto__, {
    path: '__proto__',
    before: 'old',
    after: 'new',
    changed: true,
  });
  assert.deepEqual({
    before: Object.getOwnPropertyDescriptor(Object.prototype, 'before'),
    after: Object.getOwnPropertyDescriptor(Object.prototype, 'after'),
    changed: Object.getOwnPropertyDescriptor(Object.prototype, 'changed'),
  }, prototypeDescriptors);
});

test('callFunction rejects concurrent calls to keep evidence isolated', async () => {
  const manager = new FakeDeviceManager();
  let finishCall;
  manager.functionResult = new Promise((resolve) => {
    finishCall = resolve;
  });
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const filePath = createProbeFile('export function run() {}');

  const firstCall = connection.callFunction({
    filePath,
    functionName: 'run',
  });

  await assert.rejects(
    connection.callFunction({ filePath, functionName: 'run' }),
    /Another function is already running/,
  );
  finishCall({ ok: true });
  assert.equal((await firstCall).result.ok, true);
});

test('callFunction validates its input and requires a readable probe file', async () => {
  const connection = new GadgetConnection(new FakeDeviceManager());

  await assert.rejects(
    connection.callFunction({ filePath: '/tmp/probe.js', functionName: 'run' }),
    /Connect to MobileEasyUse/,
  );
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  await assert.rejects(
    connection.callFunction({ filePath: '/tmp/missing-probe.js', functionName: 'run' }),
    /Failed to read script file/,
  );
  await assert.rejects(
    connection.callFunction({ filePath: '', functionName: 'run' }),
    /filePath must be a non-empty string/,
  );
  await assert.rejects(
    connection.callFunction({ filePath: '/tmp/probe.js', functionName: 'run', args: {} }),
    /args must be an array/,
  );
  const emptyFilePath = createProbeFile('');
  await assert.rejects(
    connection.callFunction({ filePath: emptyFilePath, functionName: 'run' }),
    /is empty/,
  );
  for (const source of [
    'exports.run = function run() {};',
    'module.exports = { run() {} };',
    'rpc.exports.run = function run() {};',
  ]) {
    await assert.rejects(
      connection.callFunction({ filePath: createProbeFile(source), functionName: 'run' }),
      /standard ES Modules.*not supported/,
    );
  }
});

test('failed SDK initialization resets the connection', async () => {
  const manager = new FakeDeviceManager();
  manager.sdkLoadError = new Error('SDK initialization failed');
  const connection = new GadgetConnection(manager);

  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1' })),
    /SDK initialization failed/,
  );
  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.equal(manager.createdScripts[0].script.unloadCalls, 1);
  assert.equal(manager.sessionDetached, true);
});

test('failed SDK runtime readiness resets the connection', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus = { platform: 'android', available: false };
  const connection = new GadgetConnection(manager);

  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1' })),
    /SDK runtime is unavailable.*available.*false/,
  );
  assert.equal(connection.state, 'disconnected');
  assert.equal(connection.currentConnection, null);
  assert.equal(manager.createdScripts[0].script.unloadCalls, 1);
  assert.equal(manager.sessionDetached, true);
});
