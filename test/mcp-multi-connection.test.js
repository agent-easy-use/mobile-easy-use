import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConnectionInstance, connectionKey } from '../src/mcp-connection.js';
import { McpJsonlLogger } from '../src/mcp-logger.js';
import { MobileMcpServer } from '../src/mcp-server.js';

function toolRequest(id, name, arguments_) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: arguments_ },
  };
}

function connectRequest(id, target, endpoint = {}) {
  return toolRequest(id, 'connect', {
    platform: 'android',
    runtimePort: 8484,
    ip: '127.0.0.1',
    port: 18484,
    ...target,
    ...endpoint,
  });
}

class FakeConnection {
  constructor(target, { failConnect = false, disconnectError = null } = {}) {
    this.deviceId = target.deviceId;
    this.appId = target.appId;
    this.platform = target.platform ?? 'android';
    this.failConnect = failConnect;
    this.disconnectError = disconnectError;
    this.messages = [];
    this.calls = [];
    this.disconnectCalls = 0;
    this.address = null;
    this.isUsable = false;
  }

  execute(message, operation) {
    this.messages.push(message);
    return operation(this);
  }

  async connect(args) {
    this.calls.push(['connect', args]);
    if (this.failConnect) throw new Error('connect failed');
    this.address = `${args.ip}:${args.port}`;
    this.isUsable = true;
    return { connected: true, state: 'connected' };
  }

  async callFunction(args) {
    this.calls.push(['call_function', args]);
    return { result: this.deviceId, evidence: [] };
  }

  async evalScript(args) {
    this.calls.push(['eval_script', args]);
    return { result: this.deviceId, evidence: [] };
  }

  async disconnect() {
    this.disconnectCalls += 1;
    if (this.disconnectError !== null) throw this.disconnectError;
    this.isUsable = false;
    this.address = null;
    return { connected: false, state: 'disconnected' };
  }
}

class FakeLogger {
  constructor() {
    this.records = [];
  }

  request(message, connectionId = null) {
    this.records.push({ type: 'request', message, connectionId });
  }

  response(message, connectionId = null) {
    this.records.push({ type: 'response', message, connectionId });
  }

  parseError(error, line) {
    this.records.push({ type: 'parseError', error, line });
  }
}

function createServer(createConnection, logger = new FakeLogger()) {
  return new MobileMcpServer({}, {
    createLogger: () => logger,
    createConnection,
  });
}

test('connectionKey uses deviceId and appId without delimiter collisions', () => {
  assert.equal(connectionKey('device', 'app'), '["device","app"]');
  assert.notEqual(connectionKey('a/b', 'c'), connectionKey('a', 'b/c'));
});

test('single MCP server creates independent connections and reuses the same target', async () => {
  const created = [];
  const server = createServer((target) => {
    const connection = new FakeConnection(target);
    created.push(connection);
    return connection;
  });
  const targetA = { deviceId: 'device-A', appId: 'app-X' };
  const targetB = { deviceId: 'device-B', appId: 'app-Y' };

  await server.handle(connectRequest(1, targetA));
  await server.handle(connectRequest(2, targetB, { port: 19484 }));
  await server.handle(connectRequest(3, targetA, { runtimePort: 9484, port: 29484 }));
  await server.handle(toolRequest(4, 'eval_script', {
    ...targetA, source: '(async () => { return true; })()',
  }));
  await server.handle(toolRequest(5, 'call_function', {
    ...targetB, filePath: '/tmp/probe.js', functionName: 'run',
  }));

  assert.equal(created.length, 2);
  assert.deepEqual(created[0].messages.map((message) => message.id), [1, 3, 4]);
  assert.deepEqual(created[1].messages.map((message) => message.id), [2, 5]);
  assert.equal(server.connections.size, 2);
});

test('server rejects operations without an existing target connection', async () => {
  const logger = new FakeLogger();
  const server = createServer(() => null, logger);

  const response = await server.handle(toolRequest(1, 'eval_script', {
    deviceId: 'missing-device',
    appId: 'missing-app',
    source: '(async () => { return true; })()',
  }));

  assert.equal(response.result.isError, true);
  assert.match(response.result.structuredContent.error.message, /Connect to MobileEasyUse/);
  assert.deepEqual(response.result.structuredContent.evidence, []);
  assert.equal(logger.records.length, 2);
});

test('server removes a newly-created connection when its first connect fails', async () => {
  const connection = new FakeConnection({
    deviceId: 'device-A', appId: 'app-X', platform: 'android',
  }, { failConnect: true });
  const server = createServer(() => connection);

  const response = await server.handle(connectRequest(1, {
    deviceId: 'device-A', appId: 'app-X',
  }));

  assert.equal(response.result.isError, true);
  assert.equal(server.connections.size, 0);
});

test('server keeps platform immutable for an existing connection', async () => {
  const connection = new FakeConnection({
    deviceId: 'device-A', appId: 'app-X', platform: 'android',
  });
  const server = createServer(() => connection);
  await server.handle(connectRequest(1, { deviceId: 'device-A', appId: 'app-X' }));

  const response = await server.handle(connectRequest(2, {
    deviceId: 'device-A', appId: 'app-X',
  }, { platform: 'ios' }));

  assert.equal(response.result.isError, true);
  assert.match(response.result.structuredContent.error, /already uses platform "android"/);
  assert.deepEqual(connection.calls.map(([name]) => name), ['connect']);
});

test('server rejects a Host endpoint already owned by another connection', async () => {
  const created = [];
  const server = createServer((target) => {
    const connection = new FakeConnection(target);
    created.push(connection);
    return connection;
  });
  await server.handle(connectRequest(1, { deviceId: 'device-A', appId: 'app-X' }));

  const response = await server.handle(connectRequest(2, {
    deviceId: 'device-B', appId: 'app-Y',
  }));

  assert.equal(response.result.isError, true);
  assert.match(response.result.structuredContent.error, /Host endpoint.*already used/);
  assert.equal(created[1].calls.length, 0);
  assert.equal(server.connections.size, 1);
});

test('server disconnects and removes only the selected connection', async () => {
  const created = [];
  const server = createServer((target) => {
    const connection = new FakeConnection(target);
    created.push(connection);
    return connection;
  });
  const targetA = { deviceId: 'device-A', appId: 'app-X' };
  const targetB = { deviceId: 'device-B', appId: 'app-Y' };
  await server.handle(connectRequest(1, targetA));
  await server.handle(connectRequest(2, targetB, { port: 19484 }));

  await server.handle(toolRequest(3, 'disconnect', targetA));

  assert.equal(server.connections.has(connectionKey(targetA.deviceId, targetA.appId)), false);
  assert.equal(server.connections.has(connectionKey(targetB.deviceId, targetB.appId)), true);
  assert.deepEqual(created[0].messages.map((message) => message.id), [1, 3]);
  assert.deepEqual(created[1].messages.map((message) => message.id), [2]);
});

test('server keeps targeted disconnect idempotent after connection removal', async () => {
  const logger = new FakeLogger();
  const server = createServer(() => null, logger);
  const response = await server.handle(toolRequest(1, 'disconnect', {
    deviceId: 'device-A', appId: 'app-X',
  }));

  assert.equal(response.result.isError, false);
  assert.deepEqual(response.result.structuredContent, {
    connected: false,
    state: 'disconnected',
  });
  assert.deepEqual(logger.records.map((record) => record.type), ['request', 'response']);
});

test('server closeAll attempts every connection and reports the first error', async () => {
  const first = new FakeConnection({ deviceId: 'device-A', appId: 'app-X' }, {
    disconnectError: new Error('first failure'),
  });
  const second = new FakeConnection({ deviceId: 'device-B', appId: 'app-Y' });
  const connections = [first, second];
  const server = createServer(() => connections.shift());
  await server.handle(connectRequest(1, { deviceId: 'device-A', appId: 'app-X' }));
  await server.handle(connectRequest(2, {
    deviceId: 'device-B', appId: 'app-Y',
  }, { port: 19484 }));

  await assert.rejects(server.closeAll(), /first failure/);

  assert.equal(first.disconnectCalls, 1);
  assert.equal(second.disconnectCalls, 1);
  assert.equal(server.connections.size, 0);
});

test('connection instance binds request and response logs around its operation', async () => {
  const logger = new FakeLogger();
  const connection = new ConnectionInstance(
    {},
    { deviceId: 'device-A', appId: 'app-X', platform: 'android' },
    { connectionId: 'connection-A', logger },
  );
  const request = toolRequest(1, 'eval_script', {
    deviceId: 'device-A', appId: 'app-X', source: '(async () => {})()',
  });

  await connection.execute(request, async () => ({ jsonrpc: '2.0', id: 1, result: {} }));

  assert.deepEqual(logger.records.map((record) => [record.type, record.connectionId]), [
    ['request', 'connection-A'],
    ['response', 'connection-A'],
  ]);
});

test('connection instances write request and response pairs to separate log files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mobile-easy-use-connection-log-'));
  const now = () => new Date(2026, 8, 3, 12, 0, 0);
  const createLogger = () => new McpJsonlLogger(directory, { now, processId: 'process-1' });
  const first = new ConnectionInstance({}, {
    deviceId: 'device-A', appId: 'app-X', platform: 'android',
  }, { connectionId: 'connection-A', logger: createLogger() });
  const second = new ConnectionInstance({}, {
    deviceId: 'device-B', appId: 'app-Y', platform: 'android',
  }, { connectionId: 'connection-B', logger: createLogger() });

  await first.execute(toolRequest(1, 'eval_script', {
    deviceId: 'device-A', appId: 'app-X', source: '(async () => {})()',
  }), async () => ({ jsonrpc: '2.0', id: 1, result: {} }));
  await second.execute(toolRequest(2, 'eval_script', {
    deviceId: 'device-B', appId: 'app-Y', source: '(async () => {})()',
  }), async () => ({ jsonrpc: '2.0', id: 2, result: {} }));

  const firstRecords = readFileSync(
    join(directory, '2026-09-03', 'connect-connection-A.jsonl'), 'utf8',
  ).trim().split('\n').map(JSON.parse);
  const secondRecords = readFileSync(
    join(directory, '2026-09-03', 'connect-connection-B.jsonl'), 'utf8',
  ).trim().split('\n').map(JSON.parse);
  assert.deepEqual(firstRecords.map((record) => record.id), [1, 1]);
  assert.deepEqual(secondRecords.map((record) => record.id), [2, 2]);
  assert.ok(firstRecords.every((record) => record.connectionId === 'connection-A'));
  assert.ok(secondRecords.every((record) => record.connectionId === 'connection-B'));
});
