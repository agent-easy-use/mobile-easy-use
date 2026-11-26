import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GadgetConnection as BaseGadgetConnection } from '../../src/mcp-api/api.js';
import { IOSSigningError } from '../../src/mcp-api/ios-signing.js';
import { CompatibilityError } from '../../src/compatibility.js';
import { MCP_VERSION } from '../../src/package-info.js';

const testCatalog = Object.freeze({
  schemaVersion: 1,
  latestReleaseVersion: '0.1.0',
  releases: { '0.1.0': { minimumMcpVersion: '0.1.0', maximumMcpVersion: MCP_VERSION } },
});

function GadgetConnection(deviceManager, options = {}) {
  return new BaseGadgetConnection(deviceManager, {
    loadCompatibility: async () => testCatalog,
    ...options,
  });
}

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
      releaseVersion: '0.1.0',
    };
    this.runtimeStatusCalls = 0;
    this.gcCalls = 0;
    this.gcError = null;
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
        script.exports.collectGarbage = async () => {
          this.gcCalls += 1;
          if (this.gcError) throw this.gcError;
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
  assert.equal(manager.gcCalls, 1);
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
    runtime: {
      platform: 'android', available: true, appId: 'com.example.app',
      releaseVersion: '0.1.0',
    },
    compatibility: {
      releaseVersion: '0.1.0', mcpVersion: MCP_VERSION,
      minimumMcpVersion: '0.1.0', maximumMcpVersion: MCP_VERSION,
      mcpCommand: `npx -y @agent-easy-use/mobile-easy-use@${MCP_VERSION}`,
      compatible: true, upgradeRecommendation: null,
    },
  });
});

test('connect loads a built preset ES module when it exists', async () => {
  const manager = new FakeDeviceManager();
  const loads = [];
  const connection = new GadgetConnection(manager, {
    loadPresets: async platform => {
      loads.push(platform);
      return 'built preset ES module';
    },
  });

  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  assert.deepEqual(loads, ['android']);
  assert.deepEqual(manager.presetBundles, [{
    modulePath: '/meu/presets.js',
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

test('connect continues when the compatibility catalog is unavailable', async () => {
  const manager = new FakeDeviceManager();
  const connection = new GadgetConnection(manager, {
    loadCompatibility: async () => {
      throw new CompatibilityError(
        'COMPATIBILITY_CATALOG_UNAVAILABLE',
        'Unable to fetch the MobileEasyUse compatibility catalog; retry connect.',
      );
    },
  });

  const result = await connection.connect(targetInput());

  assert.equal(result.connected, true);
  assert.equal(result.compatibility, null);
  assert.match(result.compatibilityWarning, /Compatibility check skipped/);
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
  let compatibilityLoads = 0;
  const connection = new GadgetConnection(manager, {
    loadCompatibility: async () => {
      compatibilityLoads += 1;
      return testCatalog;
    },
  });
  const first = await connection.connect(targetInput({ ip: '127.0.0.1', port: 18484 }));
  const connectionId = connection.getConnectionId();

  const reused = await connection.connect(targetInput({ ip: '127.0.0.1', port: 19484 }));

  assert.deepEqual(reused, first);
  assert.equal(compatibilityLoads, 1);
  assert.equal(connection.getConnectionId(), connectionId);
  assert.deepEqual(manager.addresses, ['127.0.0.1:18484']);
  assert.equal(manager.createdScripts.length, 1);
  assert.equal(manager.loadedModules.length, 0);
  assert.equal(manager.runtimeStatusCalls, 2);
  assert.equal(manager.gcCalls, 2);
});

test('iOS connect loads before a real connection and skips loading on reuse', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus = {
    platform: 'ios',
    available: true,
    appId: 'com.example.app',
    releaseVersion: '0.1.0',
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
    'load:device-1:com.example.app',
    'connect',
    'prepare',
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

test('missing iOS signing configuration fails after runtime compatibility validation', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus = {
    platform: 'ios', available: true, appId: 'com.example.app',
    releaseVersion: '0.1.0',
  };
  let loaded = false;
  const error = new IOSSigningError('IOS_SIGNING_SETUP_REQUIRED', 'Run to-ios-integrate');
  const connection = new GadgetConnection(manager, {
    prepareIOSRunner: async () => { throw error; },
    loadIOSAppRuntime: async () => { loaded = true; },
  });
  await assert.rejects(connection.connect(targetInput({ platform: 'ios' })), actual => actual === error);
  assert.equal(loaded, true);
  assert.deepEqual(manager.addresses, ['127.0.0.1:18484']);
  assert.equal(connection.state, 'disconnected');
});

test('iOS connect reuses prepared signing without persisting configuration', async () => {
  const manager = new FakeDeviceManager();
  manager.runtimeStatus = {
    platform: 'ios', available: true, appId: 'com.example.app',
    releaseVersion: '0.1.0',
  };
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
  assert.deepEqual(result, { result: null });

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


test('evalScript rejects concurrent operations and clears its active call after failure', async () => {
  const manager = new FakeDeviceManager();
  let finishEval;
  manager.evalResult = new Promise((resolve) => {
    finishEval = resolve;
  });
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));
  const source = '(async () => { return true; })()';

  const firstEval = connection.evalScript({ source });
  await assert.rejects(
    connection.evalScript({ source }),
    /Another operation is already running/,
  );
  finishEval(true);
  await firstEval;

  manager.evalError = new Error('syntax error');
  manager.evalError.stack = 'Error: syntax error\n    at inspect (/eval/source.js:4:9)';
  const failure = await connection.evalScript({ source }).catch((error) => error);
  assert.match(failure.message, /Failed to evaluate script: syntax error/);
  assert.match(failure.stack, /at inspect \(\/eval\/source\.js:4:9\)/);
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
  });
  await connection.connect(targetInput());

  const result = await connection.callFunction({
    filePath: createProbeFile('export function run() {}'),
    functionName: 'run',
  });

  assert.equal(Object.hasOwn(result, 'evidence'), false);
  assert.deepEqual(manager.createdScripts[0].script.postCalls, [{
    type: 'mobile-easy-use.controller.response.empty-window',
    payload: {
      ok: false,
      responsePayload: { error: { message: 'file.write payload.blob is required' } },
    },
  }]);
});

test('callFunction preserves stack when the export throws', async () => {
  const manager = new FakeDeviceManager();
  manager.functionCallError = new Error('export failed');
  manager.functionCallError.stack = 'Error: export failed\n    at run (/probe/module.js:7:3)';
  const connection = new GadgetConnection(manager);
  await connection.connect(targetInput({ ip: '127.0.0.1' }));

  const failure = await connection.callFunction({
    filePath: createProbeFile('export function run() {}'),
    functionName: 'run',
  }).catch((error) => error);

  assert.match(failure.message, /Failed to call function: export failed/);
  assert.match(failure.stack, /at run \(\/probe\/module\.js:7:3\)/);
});


test('callFunction rejects concurrent calls to serialize operations', async () => {
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

test('failed SDK loading resets the connection', async () => {
  const manager = new FakeDeviceManager();
  manager.sdkLoadError = new Error('SDK loading failed');
  const connection = new GadgetConnection(manager);

  await assert.rejects(
    connection.connect(targetInput({ ip: '127.0.0.1' })),
    /SDK loading failed/,
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

for (const reuse of [false, true]) {
  test(`connect cleans up when runtime GC fails (reuse=${reuse})`, async () => {
    const manager = new FakeDeviceManager();
    const connection = new GadgetConnection(manager);
    if (reuse) await connection.connect(targetInput());
    manager.gcError = new Error('GC failed');
    await assert.rejects(connection.connect(targetInput()), /GC failed/);
    assert.equal(manager.gcCalls, reuse ? 2 : 1);
    assert.equal(connection.getConnectionId(), null);
    assert.equal(manager.createdScripts[0].script.unloadCalls, 1);
  });
}


test('callFunction writes screenshot files independently of its return value', async () => {
  const manager = new FakeDeviceManager();
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const evidenceDirectory = mkdtempSync(join(tmpdir(), 'mobile-screenshot-'));
  const filePath = join(evidenceDirectory, 'window.jpg');
  manager.functionMessages = [[{
    type: 'send',
    payload: {
      source: 'mobile-easy-use', channel: 'controller.request',
      payload: { requestId: 'window', action: 'file.write', payload: { filePath: 'window.jpg' } },
    },
  }, image]];
  manager.functionResult = { screenshotPath: filePath };
  const connection = new GadgetConnection(manager, { evidenceDirectory });
  await connection.connect(targetInput());
  const result = await connection.callFunction({
    filePath: createProbeFile('export function run() {}'), functionName: 'run',
  });
  assert.deepEqual(result, { result: { screenshotPath: filePath } });
  assert.deepEqual(readFileSync(filePath), image);
  assert.deepEqual(manager.createdScripts[0].script.postCalls, [{
    type: 'mobile-easy-use.controller.response.window',
    payload: { ok: true, responsePayload: { filePath } },
  }]);
});
