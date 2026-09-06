#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { getDeviceManager } from 'frida';
import { MobileMcpServer } from './mcp-server.js';
import { DEFAULT_EVIDENCE_DIRECTORY, DEFAULT_LOG_DIRECTORY } from './output-paths.js';

const deviceManager = getDeviceManager();
const server = new MobileMcpServer(deviceManager, {
  logDirectory: DEFAULT_LOG_DIRECTORY,
  gadgetConnectionOptions: {
    evidenceDirectory: DEFAULT_EVIDENCE_DIRECTORY,
  },
});
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

let shutdownPromise = null;

function shutdown() {
  if (shutdownPromise !== null) return shutdownPromise;
  shutdownPromise = (async () => {
    input.close();
    let firstError = null;
    try {
      await server.closeAll();
    } catch (error) {
      firstError = error;
    }
    try {
      await deviceManager.close();
    } catch (error) {
      firstError ??= error;
    }
    if (firstError !== null) throw firstError;
  })();
  return shutdownPromise;
}

function shutdownForSignal(exitCode) {
  process.exitCode = exitCode;
  void shutdown().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to shut down mobile-easy-use: ${message}\n`);
    process.exitCode = 1;
  });
}

process.once('SIGHUP', () => shutdownForSignal(129));
process.once('SIGINT', () => shutdownForSignal(130));
process.once('SIGTERM', () => shutdownForSignal(143));

try {
  for await (const line of input) {
    if (!line.trim()) {
      continue;
    }
    let request;
    try {
      request = JSON.parse(line);
    } catch (error) {
      const response = server.handleParseError(error, line);
      process.stdout.write(`${JSON.stringify(response)}\n`);
      continue;
    }

    const response = await server.handle(request);
    if (response !== null) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
} finally {
  await shutdown();
}
