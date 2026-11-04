import ObjC from 'frida-objc-bridge';
import { IOSRuntime } from '../runtime.js';
import { requireObjCRuntime } from '../common/main-thread.js';
import { currentThreadName } from '../common/thread.js';

const MAX_RECORDS = 10000;

/**
 * Observe execution without replacing business results. Capture callbacks return
 * named fields; values are kept as-is (including Frida wrappers), never serialized.
 * The caller owns native references stored in those fields and their lifetime.
 * Like override.method, ObjC.implement uses NativeCallback ABI values, without
 * the ObjC bridge's high-level fromNative/toNative conversions. filter and
 * enter/leave args contain raw values; leave.result is the raw IMP return value.
 * Object/SEL/pointer values are NativePointer (nil is a null pointer), BOOL is
 * numeric, and 64-bit integers/structs follow Frida ABI types. Only receiver is
 * explicitly wrapped as ObjC.Object. Wrap object pointers after checking isNull().
 * Capture return fields are evidence only; they do not replace the method result.
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

  requireObjCRuntime();
  const { selector } = definition;
  if (typeof selector !== 'string' || !/^[-+] \S/.test(selector)) throw new TypeError('Expected a selector with - or + prefix');
  const owner = IOSRuntime.findClass(className, [selector]);
  const selected = owner?.[selector];
  if (!selected?.implementation) throw new Error(`Objective-C method not found: ${selector}`);
  const clock = new NativeFunction(Module.getGlobalExportByName('clock_gettime_nsec_np'), 'uint64', ['uint']);
  now = () => BigInt(clock(8).toString()); // CLOCK_UPTIME_RAW: monotonic, excludes sleep.
  const original = selected.implementation;
  // Typed replacement lets Frida handle scalar, floating-point and struct ABI
  // values. No ObjC high-level conversions are applied to business args/results.
  const replacement = ObjC.implement(selected, function (receiverPointer, command, ...args) {
    const receiver = attempt('receiver', undefined, () => new ObjC.Object(receiverPointer));
    const call = receiver === undefined ? null : begin(receiver, args, this.context);
    // Objective-C exception unwinding through this JS replacement is unsupported.
    const result = original(receiverPointer, command, ...args);
    end(call, receiver, args, result, undefined, false);
    return result;
  });
  selected.implementation = replacement;
  remove = () => {
    if (!selected.implementation.equals(replacement)) throw new Error('Method implementation changed after watch installation');
    selected.implementation = original;
  };

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

function readStack(limit, context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, limit).map(address => {
    const symbol = DebugSymbol.fromAddress(address);
    return { address: address.toString(), moduleName: symbol.moduleName ?? null,
      name: symbol.name ?? null, fileName: symbol.fileName || null, lineNumber: symbol.lineNumber || null };
  });
}
