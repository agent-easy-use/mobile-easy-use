/**
 * Line-delimited JSON channel between Node and Python. Session owns LLDB startup/shutdown.
 * input = child.stdout; output = child.stdin.
 * Buffer data chunks, which may contain partial or multiple lines, then split and parse JSON.
 *
 * request('add', { id: 'debugger-1', definition })
 *   → output: { id: 1, action: 'add', payload: { id: 'debugger-1', definition } } + '\n'
 *   → pending[1] stores the request Promise's resolve/reject callbacks and timeout timer
 *   ← input:  { id: 1, ok: true, value: { locations: 1 } } + '\n'
 *   → receive resolves the Promise; awaiting the request yields { locations: 1 }
 * The outer numeric id matches requests to replies; it is unrelated to the breakpoint id in payload.
 *
 * { type: 'ready' } resolves the ready Promise created in the constructor: Worker can accept commands.
 */
export class DebuggerTransport {
  constructor({ input, output }) {
    this.pending = new Map();
    this.sequence = 0;
    this.output = output;
    this.failure = null;
    this.ready = this.waitFor('ready', 'ready');
    let buffer = '';
    input.setEncoding('utf8');
    input.on('data', chunk => {
      buffer += chunk;
      try {
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const message = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          this.receive(message);
        }
        if (buffer.length > 16 * 1024 * 1024) throw new Error('Debugger reply too large');
      } catch (error) { this.fail(error); }
    });
    for (const stream of [input, output]) {
      stream.on('error', error => this.fail(error));
    }
    input.on('end', () => this.fail(new Error('Debugger channel ended')));
  }

  /**
   * Register a waiter without sending a message. Update pending synchronously and return the reply Promise.
   * id is a numeric request ID or 'ready' for startup; action only describes timeout errors.
   * After 90 seconds, remove the waiter and reject; this does not cancel an operation received by Python.
   */
  waitFor(id, action) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Debugger ${action} timed out`));
      }, 90000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  /**
   * Handle a parsed reply: find its waiter by id, remove it from pending, and clear its timer.
   * ready or ok:true resolves with value; ok:false rejects with Error(error).
   * Ignore replies without a waiter, including late replies after a timeout.
   */
  receive(message) {
    const id = message.type === 'ready' ? 'ready' : message.id;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (id === 'ready' || message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error));
  }

  /** Save the channel failure and reject all pending and subsequent requests. */
  fail(error) {
    if (this.failure || this.closed) return;
    this.failure = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Allocate an increasing id, serialize the command, register via waitFor, then write to output.
   * Return a Promise for Python's reply; a completed write does not mean the command succeeded.
   * Register before sending so receive can find the waiter even for an immediate reply.
   */
  request(action, payload = {}) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed) return Promise.reject(new Error('Debugger channel is closed'));
    const id = ++this.sequence;
    const line = JSON.stringify({ id, action, payload }) + '\n';
    const reply = this.waitFor(id, action);
    this.output.write(line);
    return reply;
  }

  /** Called after Session receives a successful detach reply: end input and reject new requests. */
  end() {
    this.closed = true;
    this.output.end();
  }
}
