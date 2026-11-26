import Java from 'frida-java-bridge';
import { backend, check, takeString, readVariable } from '../common/debugger/native.js';
import { registerBreakpoint } from '../common/debugger/index.js';

const MAX_RECORDS = 10000;

/**
 * Capture a Java frame at a source line. get() returns owned Frida values;
 * capture fields are kept as-is, without serialization or explicit disposal.
 * Only get itself expires after the callback. Saved wrappers follow Frida GC.
 */
async function watch(definition, options = {}) {
  const { className, method: name, argumentTypes, fileLine, condition } = definition;
  const { capture, stack = 0 } = options;
  if (!Number.isSafeInteger(fileLine) || fileLine < 1) throw new TypeError('fileLine must be a positive integer');
  if (!Number.isInteger(stack) || stack < 0 || stack > 0x7fffffff) throw new TypeError('stack must be a non-negative 32-bit integer');
  const entries = Object.entries(capture ?? {});
  let api, factory, remove, closed = false, sequence = 0, failure = null;
  const records = [];
  const message = error => String(error?.message ?? error);
  const fail = (record, stage, error, field) => {
    const text = message(error);
    failure ??= `${stage}${field === undefined ? '' : ` ${field}`}, hit ${record.hitId}: ${text}`;
  };
  const makeRecord = () => ({ hitId: `h${++sequence}`, timestamp: new Date().toISOString(),
    threadId: Process.getCurrentThreadId(), threadName: null });
  const onHit = hit => {
    if (closed) return;
    let active = true, record;
    const get = name => {
      if (!active) throw new Error('get is only valid during this code hit');
      return readVariable(api, hit, name, factory);
    };
    try {
      if (condition) {
        try {
          if (!condition({ get })) return;
        } catch (error) { failure ??= `condition: ${message(error)}`; return; }
      }
      if (sequence >= MAX_RECORDS) {
        failure ??= 'Code capture limit reached';
        return;
      }
      record = makeRecord();
      try { record.threadName = takeString(api, api.thread(hit)); }
      catch (error) { fail(record, 'thread', error); }
      if (stack) {
        try {
          const output = Memory.alloc(Process.pointerSize);
          check(api.stack(hit, stack, output), 'Read stack');
          record.stack = JSON.parse(takeString(api, output.readPointer()));
        } catch (error) { fail(record, 'stack', error); }
      }
      if (capture !== undefined) {
        record.capture = Object.create(null);
        for (const [field, source] of entries) {
          try {
            record.capture[field] = typeof source === 'string' ? get(source) : source({ get });
          } catch (error) { fail(record, 'capture', error, field); }
        }
      }
    } catch (error) { failure ??= `framework: ${message(error)}`; }
    finally { active = false; if (record) records.push(record); }
  };
  const onFinish = (hit, error) => {
    // Pure observation has no post-capture writes/earlyReturn. Only native
    // failures before onHit (e.g. PushLocalFrame) need reporting here.
    if (!error) return;
    try { check(error, 'Complete code hit'); }
    catch (cause) { failure ??= `framework: ${message(cause)}`; }
  };

  const snapshot = (error = failure) => ({ ok: error === null, error,
    data: records.map(record => ({ ...record,
      ...(record.capture === undefined ? {} : { capture: { ...record.capture } }),
      ...(record.stack === undefined ? {} : { stack: record.stack.map(frame => ({ ...frame })) }),
    })),
  });
  Java.performNow(() => {
    const owner = Java.use(className);
    const wrapper = owner[name];
    if (!Array.isArray(wrapper?.overloads)) throw new Error('Java method not found');
    if (argumentTypes === undefined && wrapper.overloads.length !== 1) throw new Error('Specify argumentTypes for an overloaded method');
    const method = argumentTypes === undefined ? wrapper.overloads[0] : wrapper.overload(...argumentTypes);
    factory = Java.ClassFactory.get(owner.class.getClassLoader());
    api = backend();
    remove = registerBreakpoint(method, fileLine, { onHit, onFinish });
  });
  return {
    async current() {
      return closed ? { ok: false, data: [], error: 'Code watcher has stopped' } : snapshot();
    },
    async stop() {
      closed = true;
      try { await remove(); return snapshot(); }
      catch (error) { return snapshot(message(error)); }
    },
  };
}

export const code = Object.freeze({ watch });
