import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SENSITIVE_KEY = /token|password|secret|authorization|cookie|credential|certificate/i;

export class McpJsonlLogger {
  constructor(logDirectory, { now = () => new Date(), processId = randomUUID() } = {}) {
    this.logDirectory = logDirectory;
    this.now = now;
    this.processId = processId;
    this.processDate = formatLocalDate(now());
    this.connectionDates = new Map();
    this.pending = new Map();
    mkdirSync(logDirectory, { recursive: true });
  }

  request(message, connectionId = null) {
    const isObject = message !== null && typeof message === 'object';
    const id = isObject ? message.id : undefined;
    const method = isObject ? message.method : undefined;
    const record = {
      direction: 'request',
      id: id ?? null,
      method: method ?? null,
      tool: method === 'tools/call' ? message.params?.name ?? null : null,
      payload: sanitizeForLog(message),
    };
    if (id !== undefined) {
      this.pending.set(id, { startedAt: Date.now(), record, connectionId });
      return;
    }
    this.#write(record, connectionId);
  }

  response(message, connectionId = null) {
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    const targetConnectionId = pending?.connectionId ?? connectionId;
    if (pending !== undefined) {
      this.#write(pending.record, targetConnectionId);
    }
    this.#write({
      direction: 'response',
      id: message.id ?? null,
      durationMs: pending === undefined ? null : Date.now() - pending.startedAt,
      success: message.error === undefined && message.result?.isError !== true,
      payload: sanitizeForLog(message),
    }, targetConnectionId);
  }

  parseError(error, line, connectionId = null) {
    this.#write({
      direction: 'parse_error',
      id: null,
      lineBytes: Buffer.byteLength(line, 'utf8'),
      error: error.message,
    }, connectionId);
  }

  #write(record, connectionId) {
    const now = this.now();
    const line = JSON.stringify({
      timestamp: now.toISOString(),
      connectionId,
      ...record,
    });
    const logDate = connectionId === null
      ? this.processDate
      : this.#connectionDate(connectionId, now);
    const datedDirectory = join(this.logDirectory, logDate);
    const fileName = connectionId === null
      ? `process-${this.processId}.jsonl`
      : `connect-${connectionId}.jsonl`;
    const logPath = join(datedDirectory, fileName);
    try {
      mkdirSync(datedDirectory, { recursive: true });
      appendFileSync(logPath, `${line}\n`, 'utf8');
    } catch (error) {
      process.stderr.write(`[mobile-easy-use] failed to write MCP log: ${error.message}\n`);
    }
  }

  #connectionDate(connectionId, now) {
    let date = this.connectionDates.get(connectionId);
    if (date === undefined) {
      date = formatLocalDate(now);
      this.connectionDates.set(connectionId, date);
    }
    return date;
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sanitizeForLog(value, key = '') {
  if (key === 'source' && typeof value === 'string') {
    return {
      redacted: true,
      bytes: Buffer.byteLength(value, 'utf8'),
      sha256: createHash('sha256').update(value).digest('hex'),
    };
  }
  if (SENSITIVE_KEY.test(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeForLog(childValue, childKey),
      ]),
    );
  }
  return value;
}
