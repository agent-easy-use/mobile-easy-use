import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const serverPath = fileURLToPath(new URL('../src/index.js', import.meta.url));
const timeoutMs = 5000;

function spawnServer() {
  return spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`MCP server ${child.pid} did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function waitUntilReady(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`MCP server did not initialize: ${stderr}`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lineEnd = stdout.indexOf('\n');
      if (lineEnd === -1) return;
      clearTimeout(timer);
      try {
        const response = JSON.parse(stdout.slice(0, lineEnd));
        assert.equal(response.result.serverInfo.name, 'mobile-easy-use');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    })}\n`);
  });
}

test('MCP server closes Frida resources and exits when stdin reaches EOF', async () => {
  const child = spawnServer();
  const exited = waitForExit(child);
  child.stdin.end();
  assert.deepEqual(await exited, { code: 0, signal: null });
});

test('MCP server shuts down on terminal signals', {
  skip: process.platform === 'win32',
}, async (context) => {
  const cases = [
    ['SIGHUP', 129],
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ];
  for (const [signal, exitCode] of cases) {
    await context.test(signal, async () => {
      const child = spawnServer();
      const exited = waitForExit(child);
      await waitUntilReady(child);
      child.kill(signal);
      assert.deepEqual(await exited, { code: exitCode, signal: null });
    });
  }
});
