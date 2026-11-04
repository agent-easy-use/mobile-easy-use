import Java from 'frida-java-bridge';
import { prepareStaticHook } from '../common/static-hook.js';
import { currentThreadName } from '../common/thread.js';

const MAX_RECORDS = 10000;

/**
 * Observe execution without replacing business results. Capture callbacks return
 * named fields; values are kept as-is (including Frida wrappers), never serialized.
 * The caller owns native references stored in those fields and their lifetime.
 */
async function watch(definition, options = {}) {
  const { className, filter } = definition ?? {};
  if (typeof className !== 'string' || !className.trim()) throw new TypeError('className must be a non-empty string');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
  const { enter, leave, stack = 0 } = options;
  for (const fn of [filter, enter, leave]) {
    if (fn !== undefined && (typeof fn !== 'function' || Object.prototype.toString.call(fn) !== '[object Function]')) {
      throw new TypeError('Expected a synchronous callback');
    }
  }
  if (!Number.isSafeInteger(stack) || stack < 0) throw new TypeError('stack must be a non-negative integer');
  const records = [];
  let closed = false, finished = false, stopping, remove, now;
  let captureError = null, nextCallId = 1;
  const fail = (phase, callId, error) => {
    if (!closed) captureError ??= `method ${phase}${callId === undefined ? '' : ` call ${callId}`}: ${String(error?.message ?? error)}`;
  };
  const attempt = (phase, callId, work) => {
    try { return work(); } catch (error) { fail(phase, callId, error); }
  };
  const capture = (phase, callback, record, context) => {
    if (!callback || closed) return;
    const value = attempt(phase, record.callId, () => {
      const fields = callback(context);
      if (fields === null || typeof fields !== 'object' || Array.isArray(fields)
          || typeof fields.then === 'function'
          || (Object.getPrototypeOf(fields) !== null && Object.getPrototypeOf(fields)?.constructor?.name !== 'Object')) {
        throw new TypeError('Capture must return a Record<string, any>');
      }
      return { ...fields };
    });
    if (!closed && value !== undefined) record[phase] = value;
  };
  function begin(receiver, args, cpuContext) {
    const threadId = Process.getCurrentThreadId();
    if (closed) return null;
    if (filter) {
      const accepted = attempt('filter', undefined, () => {
        const value = filter(...args);
        if (value && typeof value.then === 'function') throw new TypeError('filter must be synchronous');
        return value === true;
      });
      if (!accepted || closed) return null;
    }
    if (records.length >= MAX_RECORDS) {
      fail('capacity', undefined, 'Method capture limit reached');
      return null;
    }
    const record = { callId: nextCallId++, timestamp: new Date().toISOString(),
      threadId, threadName: null, status: 'running', durationMs: null };
    records.push(record);
    const threadName = attempt('thread', record.callId, currentThreadName);
    if (!closed) record.threadName = threadName ?? null;
    if (stack && !closed) {
      const frames = attempt('stack', record.callId, () => readStack(stack, cpuContext));
      if (!closed && frames !== undefined) record.stack = frames;
    }
    capture('enter', enter, record, { receiver, args: args.slice() });
    const started = attempt('timing', record.callId, now);
    return { record, started };
  }
  function end(call, receiver, args, result, exception, threw) {
    if (!call || closed) return;
    const { record, started } = call;
    const ended = attempt('timing', record.callId, now);
    if (closed) return;
    record.status = threw ? 'threw' : 'returned';
    if (started !== undefined && ended !== undefined) record.durationMs = Number(ended - started) / 1e6;
    capture('leave', leave, record, { receiver, args: args.slice(), result, exception });
  }

  Java.performNow(() => {
    const owner = Java.use(className);
    const selected = resolveMethod(owner, definition);
    if (selected.implementation != null) throw new Error('Method already has an implementation');
    const System = Java.use('java.lang.System');
    now = () => BigInt(System.nanoTime().toString());
    // Initialize Java.backtrace's shared native backend before concurrent calls.
    if (stack) Java.backtrace({ limit: 1 });
    prepareStaticHook(selected);
    selected.implementation = function (...args) {
      const call = begin(this, args);
      let result;
      try { result = selected.call(this, ...args); }
      catch (exception) {
        end(call, this, args, undefined, exception, true);
        throw exception; // Preserve the original Java exception.
      }
      end(call, this, args, result, undefined, false);
      return result;
    };
    const replacement = selected.implementation;
    remove = () => Java.performNow(() => {
      if (selected.implementation !== replacement) throw new Error('Method implementation changed after watch installation');
      selected.implementation = null;
    });
  });

  const snapshot = (error = captureError) => ({
    ok: error === null,
    data: records.map(record => ({ ...record,
      ...(record.enter === undefined ? {} : { enter: { ...record.enter } }),
      ...(record.leave === undefined ? {} : { leave: { ...record.leave } }),
      ...(record.stack === undefined ? {} : { stack: record.stack.map(frame => ({ ...frame })) }),
    })),
    error,
  });
  return {
    async current() {
      return closed ? { ok: false, data: [], error: 'Method watcher has stopped' } : snapshot();
    },
    async stop() {
      closed = true;
      if (finished) return snapshot();
      // Defer restoration out of capture callbacks. In-progress business calls
      // continue using their saved implementation, but cannot update final records.
      if (!stopping) stopping = Promise.resolve().then(() => {
        remove();
        finished = true;
        return null;
      }).catch(error => String(error?.message ?? error));
      const error = await stopping;
      if (error !== null) stopping = undefined;
      return snapshot(error ?? captureError);
    },
  };
}

export const method = Object.freeze({ watch });

function resolveMethod(owner, { method, argumentTypes }) {
  if (typeof method !== 'string' || !method || ['$new', '$init', '<init>', '<clinit>'].includes(method)) {
    throw new TypeError('Expected a method name; constructors are unsupported');
  }
  if (argumentTypes !== undefined && (!Array.isArray(argumentTypes) || argumentTypes.some(t => typeof t !== 'string'))) {
    throw new TypeError('argumentTypes must be an array of type names');
  }
  const wrapper = owner[method];
  if (!Array.isArray(wrapper?.overloads)) throw new Error(`Java method not found: ${method}`);
  if (argumentTypes === undefined && wrapper.overloads.length !== 1) throw new Error('Specify argumentTypes for an overloaded method');
  return argumentTypes === undefined ? wrapper.overloads[0] : wrapper.overload(...argumentTypes);
}

function readStack(limit) {
  return Java.backtrace({ limit }).frames.slice(0, limit).map(frame => ({
    className: frame.className, methodName: frame.methodName, signature: frame.signature,
    fileName: frame.fileName ?? null, lineNumber: frame.lineNumber ?? null,
  }));
}
