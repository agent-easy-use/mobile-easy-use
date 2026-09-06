import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionKey } from '../src/mcp-connection.js';
import { MobileMcpServer, toolDefinitions } from '../src/mcp-server.js';

const target = { deviceId: 'device-1', appId: 'com.example.app' };

function connectionFixture(methods = {}) {
  return {
    ...target,
    platform: 'android',
    address: '127.0.0.1:18484',
    isUsable: true,
    execute(_message, operation) {
      return operation(this);
    },
    ...methods,
  };
}

function serverWithConnection(connection) {
  const server = new MobileMcpServer({});
  server.connections.set(connectionKey(target.deviceId, target.appId), connection);
  return server;
}

test('initialize and tools/list expose a minimal MCP server', async () => {
  const server = new MobileMcpServer({});
  const initialized = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(initialized.result.serverInfo.name, 'mobile-easy-use');

  const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(listed.result.tools, toolDefinitions);
  assert.deepEqual(toolDefinitions.map((tool) => tool.name), [
    'connect',
    'disconnect',
    'call_function',
    'eval_script',
  ]);
  const connectTool = toolDefinitions.find((tool) => tool.name === 'connect');
  assert.deepEqual(connectTool.inputSchema.required, [
    'platform',
    'deviceId',
    'appId',
    'runtimePort',
    'ip',
    'port',
  ]);
  assert.match(connectTool.inputSchema.properties.ip.description, /127\.0\.0\.1/);
  assert.match(connectTool.inputSchema.properties.runtimePort.description, /Device-side/);
  assert.equal(connectTool.inputSchema.properties.processId, undefined);
  assert.equal(connectTool.outputSchema.properties.processId, undefined);
  assert.deepEqual(
    toolDefinitions.find((tool) => tool.name === 'disconnect').inputSchema.required,
    ['deviceId', 'appId'],
  );
  assert.deepEqual(
    toolDefinitions.find((tool) => tool.name === 'call_function').inputSchema.required,
    ['deviceId', 'appId', 'filePath', 'functionName'],
  );
  assert.deepEqual(
    toolDefinitions.find((tool) => tool.name === 'eval_script').inputSchema.required,
    ['deviceId', 'appId', 'source'],
  );
});

test('tools/call selects the target connection before disconnecting', async () => {
  let calls = 0;
  const server = serverWithConnection(connectionFixture({
    async disconnect() {
      calls += 1;
      return { connected: false, state: 'disconnected' };
    },
  }));

  const response = await server.handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'disconnect', arguments: target },
  });

  assert.equal(calls, 1);
  assert.deepEqual(response.result.structuredContent, {
    connected: false,
    state: 'disconnected',
  });
});

test('tools/call routes connect arguments and returns structured content', async () => {
  const calls = [];
  const connection = connectionFixture({
    isUsable: false,
    address: null,
    async connect(args) {
      calls.push(args);
      return {
        connected: true,
        state: 'connected',
        target: {
          platform: args.platform,
          deviceId: args.deviceId,
          appId: args.appId,
          runtimePort: args.runtimePort,
        },
        ip: args.ip,
        port: args.port,
        fridaTarget: 'Gadget',
      };
    },
  });
  const server = new MobileMcpServer({}, { createConnection: () => connection });
  const connectArguments = {
    platform: 'android',
    deviceId: 'device-1',
    appId: 'com.example.app',
    runtimePort: 8484,
    ip: '127.0.0.1',
    port: 18484,
  };
  const response = await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'connect', arguments: connectArguments },
  });

  assert.deepEqual(calls, [connectArguments]);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.connected, true);
  assert.equal(response.result.structuredContent.target.appId, 'com.example.app');
});

test('tools/call routes call_function arguments and returns its result', async () => {
  const calls = [];
  const server = serverWithConnection(connectionFixture({
    async callFunction(args) {
      calls.push(args);
      return {
        result: 3,
        evidence: [],
      };
    },
  }));

  const response = await server.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'call_function',
      arguments: {
        deviceId: 'device-1',
        appId: 'com.example.app',
        filePath: '/tmp/add.js',
        functionName: 'add',
        args: [1, 2],
      },
    },
  });

  assert.deepEqual(calls, [{
    deviceId: 'device-1',
    appId: 'com.example.app',
    filePath: '/tmp/add.js',
    functionName: 'add',
    args: [1, 2],
  }]);
  assert.deepEqual(response.result.structuredContent, {
    result: 3,
    evidence: [],
  });

  const definition = toolDefinitions.find((tool) => tool.name === 'call_function');
  assert.deepEqual(definition.outputSchema.required, ['evidence']);
  assert.equal(definition.outputSchema.properties.evidence.type, 'array');
  assert.equal(definition.outputSchema.oneOf.length, 2);
});

test('tools/call routes eval_script source and returns its result', async () => {
  const calls = [];
  const server = serverWithConnection(connectionFixture({
    async evalScript(args) {
      calls.push(args);
      return { result: { available: true }, evidence: [] };
    },
  }));
  const source = '(async () => { return runtimeStatus(); })()';

  const response = await server.handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'eval_script',
      arguments: { deviceId: 'device-1', appId: 'com.example.app', source },
    },
  });

  assert.deepEqual(calls, [{
    deviceId: 'device-1',
    appId: 'com.example.app',
    source,
  }]);
  assert.deepEqual(response.result.structuredContent, {
    result: { available: true },
    evidence: [],
  });
  const definition = toolDefinitions.find((tool) => tool.name === 'eval_script');
  assert.deepEqual(definition.inputSchema.required, ['deviceId', 'appId', 'source']);
  assert.deepEqual(definition.outputSchema, toolDefinitions
    .find((tool) => tool.name === 'call_function').outputSchema);
});

test('eval_script and call_function failures preserve stack and evidence', async () => {
  const failure = new Error('Failed to evaluate script: selector not found');
  failure.stack = 'Error: selector not found\n    at inspect (/eval/source.js:8:11)';
  failure.evidence = [{
    actionDescription: 'Inspect search state',
    evidencePath: '/tmp/evidence.json',
  }];
  const server = serverWithConnection(connectionFixture({
    async evalScript() {
      throw failure;
    },
    async callFunction() {
      throw failure;
    },
  }));

  for (const [name, args] of [
    ['eval_script', {
      deviceId: 'device-1',
      appId: 'com.example.app',
      source: '(async () => { throw new Error("selector not found"); })()',
    }],
    ['call_function', {
      deviceId: 'device-1',
      appId: 'com.example.app',
      filePath: '/tmp/probe.js',
      functionName: 'inspect',
    }],
  ]) {
    const response = await server.handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name, arguments: args },
    });

    assert.equal(response.result.isError, true);
    assert.deepEqual(response.result.structuredContent, {
      error: {
        message: 'Failed to evaluate script: selector not found',
        stack: 'Error: selector not found\n    at inspect (/eval/source.js:8:11)',
      },
      evidence: [{
        actionDescription: 'Inspect search state',
        evidencePath: '/tmp/evidence.json',
      }],
    });
  }
});

test('tools/call rejects unknown tools', async () => {
  const server = new MobileMcpServer({});
  const failed = await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'mobile_devices', arguments: {} },
  });
  assert.equal(failed.result.isError, true);
  assert.match(failed.result.content[0].text, /Unknown tool: mobile_devices/);
});

test('unknown protocol methods return JSON-RPC method-not-found', async () => {
  const server = new MobileMcpServer({});
  const response = await server.handle({ jsonrpc: '2.0', id: 9, method: 'unknown' });
  assert.equal(response.error.code, -32601);
});
