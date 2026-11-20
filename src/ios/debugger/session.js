import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DebuggerTransport } from './transport.js';
import { readDebuggerSymbols } from './config.js';

const worker = fileURLToPath(new URL('./worker.py', import.meta.url));
const quote = value => JSON.stringify(value);

// Owns LLDB startup, attach and detach. Transport only carries messages.
export class IOSDebuggerSession {
  static async start(request) {
    const session = new IOSDebuggerSession();
    try {
      await session.transport.ready;
      session.attachResult = await session.request('attach', request);
      return session;
    } catch (error) {
      // Attach can fail after stopping the App. Attempt detach before terminating LLDB.
      try { await session.close(); } catch (cleanupError) {
        session.child.kill('SIGTERM');
        throw new Error(`${error.message}; debugger cleanup failed: ${cleanupError.message}`);
      }
      throw error;
    }
  }

  constructor() {
    this.closed = false;
    this.diagnostics = '';
    this.child = spawn('xcrun', ['lldb', '--no-lldbinit', '--batch', '--source-quietly',
      '-o', `command script import ${quote(worker)}`, '-o', 'meu-debugger'],
    { stdio: ['pipe', 'pipe', 'pipe'] });
    this.transport = new DebuggerTransport({
      input: this.child.stdout, output: this.child.stdin,
    });
    this.child.stderr.on('data', chunk => { this.diagnostics = (this.diagnostics + chunk).slice(-16000); });
    this.child.on('error', error => this.transport.fail(error));
    this.child.on('close', (code, signal) => {
      if (!this.closed) this.transport.fail(new Error(`LLDB exited (${code ?? signal}): ${this.diagnostics}`));
    });
  }

  request(action, payload) {
    return this.transport.request(action, payload);
  }

  close() {
    if (this.closed) return Promise.resolve();
    // Explicit disconnect and destroyed/detached events may request cleanup concurrently.
    if (!this.closing) this.closing = this.request('detach').then(() => {
      this.closed = true;
      this.transport.end();
    }).catch(error => {
      this.closing = undefined;
      throw error;
    });
    return this.closing;
  }
}

async function attach(payload, _data, _owner, connection) {
  if (connection?.platform !== 'ios') throw new Error('iOS debugger requires an iOS connection');
  if (connection.iosDebugger) throw new Error('Debugger is already attached or attaching');
  // Host owns LLDB cleanup: an unloading script cannot reliably send or await RPC.
  if (!connection.debuggerUnloadBound && connection.sdkScript?.destroyed) {
    connection.sdkScript.destroyed.connect(() => {
      void closeIOSDebugger(connection).catch(error => console.error('Debugger unload cleanup failed:', error));
    });
    connection.debuggerUnloadBound = true;
  }
  const { physical, destinationId } = connection.runnerPreparation;
  // Reserve the session before reading config so concurrent attaches cannot race.
  connection.iosDebugger = readDebuggerSymbols().then(symbols => IOSDebuggerSession.start({
    pid: payload.pid,
    symbols,
    // Reuse device resolution from connect; do not probe again during debugger attach.
    device: { kind: physical ? 'device' : 'simulator', id: destinationId },
  }));
  try {
    return (await connection.iosDebugger).attachResult;
  } catch (error) {
    connection.iosDebugger = null;
    throw error;
  }
}

async function add(payload, _data, _owner, connection) {
  if (!connection?.iosDebugger) throw new Error('Debugger is not attached');
  return (await connection.iosDebugger).request('add', payload);
}

async function current(payload, _data, _owner, connection) {
  if (!connection?.iosDebugger) throw new Error('Debugger session ended before records were collected');
  return (await connection.iosDebugger).request('current', payload);
}

async function remove(payload, _data, _owner, connection) {
  if (!connection?.iosDebugger) throw new Error('Debugger session ended before records were collected');
  const session = await connection.iosDebugger;
  if (session.closed) throw new Error('Debugger session is closed');
  return session.request('remove', payload);
}

export async function closeIOSDebugger(connection) {
  if (!connection?.iosDebugger) return;
  await (await connection.iosDebugger).close();
  connection.iosDebugger = null;
}

async function detach(_payload, _data, _owner, connection) {
  await closeIOSDebugger(connection);
  return null;
}

export const IOS_DEBUGGER_ACTIONS = [
  ['ios.debugger.attach', attach],
  ['ios.debugger.add', add],
  ['ios.debugger.remove', remove],
  ['ios.debugger.current', current],
  ['ios.debugger.detach', detach],
];
