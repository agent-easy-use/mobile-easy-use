import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { McpJsonlLogger, sanitizeForLog } from '../src/mcp-logger.js';

test('MCP logger records correlated request and response entries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mobile-easy-use-log-'));
  const now = () => new Date(2026, 7, 9, 12, 0, 0);
  const logPath = join(directory, '2026-08-09', 'connect-connection-1.jsonl');
  const logger = new McpJsonlLogger(directory, { now, processId: 'process-1' });

  logger.request({ jsonrpc: '2.0', id: 7, method: 'tools/list' });
  logger.response(
    { jsonrpc: '2.0', id: 7, result: { tools: [] } },
    'connection-1',
  );

  const records = readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 2);
  assert.equal(records[0].direction, 'request');
  assert.equal(records[0].connectionId, 'connection-1');
  assert.equal(records[1].direction, 'response');
  assert.equal(records[1].id, 7);
  assert.equal(records[1].success, true);
  assert.equal(typeof records[1].durationMs, 'number');
});

test('MCP logger separates process and connection lifecycle files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mobile-easy-use-log-'));
  let current = new Date(2026, 7, 9, 23, 59, 0);
  const logger = new McpJsonlLogger(directory, {
    now: () => current,
    processId: 'process-1',
  });

  logger.request({ jsonrpc: '2.0', method: 'notifications/initialized' });
  logger.request({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'connect' } });
  logger.response({ jsonrpc: '2.0', id: 1, result: {} }, 'connection-1');
  current = new Date(2026, 7, 10, 0, 1, 0);
  logger.request(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'disconnect' } },
    'connection-1',
  );
  logger.response({ jsonrpc: '2.0', id: 2, result: {} });
  logger.request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'connect' } });
  logger.response({ jsonrpc: '2.0', id: 3, result: {} }, 'connection-2');

  assert.match(
    readFileSync(join(directory, '2026-08-09', 'process-process-1.jsonl'), 'utf8'),
    /notifications\/initialized/,
  );
  assert.equal(
    readFileSync(join(directory, '2026-08-09', 'connect-connection-1.jsonl'), 'utf8')
      .trim().split('\n').length,
    4,
  );
  assert.equal(
    readFileSync(join(directory, '2026-08-10', 'connect-connection-2.jsonl'), 'utf8')
      .trim().split('\n').length,
    2,
  );
});

test('MCP logger redacts secrets and replaces script source with metadata', () => {
  const sanitized = sanitizeForLog({
    token: 'secret-token',
    source: 'console.log("hello");',
  });

  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.source.redacted, true);
  assert.equal(sanitized.source.bytes, 21);
  assert.match(sanitized.source.sha256, /^[a-f0-9]{64}$/);
});
