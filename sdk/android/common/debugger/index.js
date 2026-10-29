import Java from 'frida-java-bridge';
import { errorMessage, safeEmit } from '../reporting.js';
import { backend, check, takeString, readVariable, writeVariable, encode, snapshot } from './native.js';

/**
 * This file orchestrates debugger registrations in JS; native.js wraps the JVMTI bridge implemented in debugger.cpp.
 *
 * Registration: validate synchronous callbacks → resolve method/return type → open breakpoint → return stop.
 * Hit: native → onHit (condition, reads, user callbacks) → native (apply early return)
 *             → onFinish (append native errors and save the record).
 * Cleanup: stop → reject new hits → drain active callbacks → dispose environment → return records.
 *
 * onHit/onFinish run synchronously on the thread that hit the breakpoint. stop is asynchronous;
 * waiting for it inside a breakpoint callback would deadlock while waiting for that callback to finish.
 */

// SDK state for disconnect cleanup; also keeps callbacks alive while native code can invoke them.
const registrations = new Set();
let shuttingDown = false;
// Track threads separately: the Host must still be able to call stop while another thread handles a hit.
const callbackThreads = new Set();
const isInBreakpointCallback = () => callbackThreads.has(Process.getCurrentThreadId());
const addError = (record, stage, error, name) => {
  (record.errors ??= []).push({ stage, ...(name === undefined ? {} : { name }), message: errorMessage(error) });
};

// The public types define the configuration shape; reject functions that cannot run synchronously.
function requireSynchronous(fn) {
  const kind = Object.prototype.toString.call(fn);
  if (['[object AsyncFunction]', '[object GeneratorFunction]', '[object AsyncGeneratorFunction]'].includes(kind)) {
    throw new Error('Debugger callbacks must be synchronous, not async or generators');
  }
}

// Resolve one exact overload and its ClassLoader factory for Java object type conversions.
function resolveMethod(definition) {
  const target = typeof definition.target === 'string' ? Java.use(definition.target) : definition.target;
  const name = definition.method;
  const wrapper = typeof name === 'string' ? target?.[name] : null;
  if (!target?.$className || !Array.isArray(wrapper?.overloads)) {
    throw new Error('Java method not found');
  }
  if (['$new', '$init', '<init>', '<clinit>'].includes(name)) {
    throw new Error('Constructors and class initializers are unsupported');
  }
  if (definition.argumentTypes === undefined && wrapper.overloads.length !== 1) {
    throw new Error('Specify argumentTypes for an overloaded method');
  }
  const method = definition.argumentTypes === undefined ? wrapper.overloads[0] : wrapper.overload(...definition.argumentTypes);
  return { method, factory: Java.ClassFactory.get(target.class.getClassLoader()) };
}

/**
 * Create one debugger registration. Callbacks and stop share this closure to keep its state together.
 * The native environment, pending hits, and completed records belong only to this registration.
 *
 * Hit lifecycle (onHit/onFinish run synchronously on the thread that hit the breakpoint):
 * 1. Native code receives the event, creates a temporary Hit and JNI reference scope, then calls onHit.
 *    JS assigns a hitId and entry order, and stores the state in pendingHits by Hit* for onFinish.
 * 2. Create the shared get function for this hit, read thread information, then run condition if present.
 *    A false condition skips the remaining stages and discards the record. A thrown error or
 *    non-boolean result also skips the stages, but preserves the record with a condition error.
 * 3. Collect stack if requested, then run observations → overrides → earlyReturn:
 *    - observations: read a name or call source({ get }), then immediately serialize the value.
 *    - overrides: compute the value, resolve the target, and write it; later get calls see the write.
 *    - earlyReturn: compute and encode the return value, then stage it in native code without returning yet.
 *    All three stages are optional. Each observation, override, stack collection, and earlyReturn
 *    records its own errors without blocking other items or later stages. Completed writes remain.
 * 4. The onHit finally block expires get, disposes temporary Java wrappers, and clears the thread marker.
 *    A framework exception outside the stage handlers cancels any staged return and records a framework error.
 * 5. After onHit returns, native code checks the target frame and applies any staged ForceEarlyReturn.
 *    It then calls onFinish to append native errors, remove the state from pendingHits, and
 *    save it in completedHits when shouldRecord is true. onFinish does not access the target frame.
 *    If JNI reference scope creation fails, onHit is skipped and onFinish creates the error record.
 * 6. Native code releases hit references and decrements the active count. After closing new hits, stop
 *    waits for this cleanup, disposes the environment, and returns records in onHit entry order.
 */
function install(definition) {
  const { method, factory } = resolveMethod(definition.breakpoint);
  const api = backend();
  // Frida already provides the return descriptor; prepare it before the first hit without querying C++.
  const returnType = method.returnType.name;
  // handle is this registration's jvmtiEnv*, not method.handle (a jmethodID).
  // Callbacks use the native Hit* and do not depend on handle being assigned after open returns.
  let handle = null;
  let hitSequence = 0;
  let stopPromise;

  // pendingHits: native Hit* address → JS hit state, connecting onHit to the later onFinish.
  // completedHits: records after native completion; concurrent hits may finish in a different order.
  const pendingHits = new Map();
  const completedHits = [];
  const makeHit = () => ({
    hitId: `h${++hitSequence}`,
    timestamp: new Date().toISOString(),
    thread: { id: String(Process.getCurrentThreadId()), name: null },
  });
  // get belongs to this hit and expires before its native frame is released.
  const onHit = new NativeCallback(hit => {
    callbackThreads.add(Process.getCurrentThreadId());
    const state = { record: makeHit(), order: hitSequence, returning: false, shouldRecord: true };
    pendingHits.set(hit.toString(), state);
    const { record } = state;
    const wrappers = [];
    let active = true;
    const get = name => {
      if (!active) throw new Error('get is only valid during this breakpoint hit');
      return readVariable(api, hit, name, factory, wrappers);
    };
    try {
      record.thread.name = takeString(api, api.thread(hit));
      const condition = definition.breakpoint.condition;
      if (condition !== undefined) {
        try {
          const matched = condition({ get });
          if (typeof matched !== 'boolean') throw new Error('Condition must return boolean');
          if (!matched) { state.shouldRecord = false; return; }
        } catch (error) { addError(record, 'condition', error); return; }
      }
      if (definition.stack !== undefined) {
        try {
          const output = Memory.alloc(Process.pointerSize);
          check(api.stack(hit, definition.stack, output), 'Read stack');
          record.stack = JSON.parse(takeString(api, output.readPointer()));
        } catch (error) { addError(record, 'stack', error); }
      }
      if (definition.observations !== undefined) {
        record.observations = Object.create(null);
        for (const [name, source] of Object.entries(definition.observations)) {
          try { record.observations[name] = snapshot(typeof source === 'string' ? get(source) : source({ get })); }
          catch (error) { addError(record, 'observations', error, name); }
        }
      }
      for (const [name, source] of Object.entries(definition.overrides ?? {})) {
        try {
          const value = typeof source === 'function' ? source({ get }) : source;
          writeVariable(api, hit, name, value, factory);
        } catch (error) { addError(record, 'overrides', error, name); }
      }
      if (Object.hasOwn(definition, 'earlyReturn')) {
        try {
          const source = definition.earlyReturn;
          const value = typeof source === 'function' ? source({ get }) : source;
          const buffer = encode(value, returnType, factory);
          check(api.return(hit, buffer), 'Prepare earlyReturn');
          state.returning = true;
        } catch (error) { addError(record, 'earlyReturn', error); }
      }
    } catch (error) {
      api.cancelReturn(hit);
      state.returning = false;
      addError(record, 'framework', error);
    } finally {
      active = false;
      for (const wrapper of wrappers) {
        try { wrapper.$dispose(); } catch (_) { /* Keep releasing the remaining wrappers. */ }
      }
      callbackThreads.delete(Process.getCurrentThreadId());
    }
  }, 'void', ['pointer']);
  // Only native completion can tell us whether ForceEarlyReturn actually succeeded.
  const onFinish = new NativeCallback((hit, error) => {
    const key = hit.toString();
    const state = pendingHits.get(key) ?? { record: makeHit(), order: hitSequence, shouldRecord: true };
    pendingHits.delete(key);
    if (error !== 0) {
      try { check(error, 'Complete breakpoint'); }
      catch (cause) { addError(state.record, state.returning ? 'earlyReturn' : 'framework', cause); }
    }
    if (state.shouldRecord) completedHits.push(state);
  }, 'void', ['pointer', 'int']);

  // Keep NativeCallbacks alive until native events are closed and all active callbacks have finished.
  const registration = { stop, onHit, onFinish };
  function stop() {
    if (isInBreakpointCallback()) {
      throw new Error('Do not await/stop a debugger from a breakpoint callback');
    }
    if (stopPromise) return stopPromise;
    // Save the Promise before cleanup. Native calls may release the JS lock; repeated stop calls share this task.
    stopPromise = Promise.resolve().then(async () => {
      // 1. Reject new hits and clear the breakpoint; propagate any failure.
      check(api.close(handle), 'Clear breakpoint');
      // 2. Wait for onHit, native completion, and onFinish without blocking the JS thread.
      while (api.active(handle) !== 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const skipped = api.reentrant(handle);
      if (skipped) safeEmit('probe.debugger.reentrant', { count: skipped });
      // 3. Disposal requires a JNI thread context. Release callbacks only after it succeeds.
      Java.performNow(() => check(api.dispose(handle), 'Dispose debugger'));
      registrations.delete(registration);
      // 4. Return raw records in JS callback entry order, without aggregation or deduplication.
      return completedHits.sort((a, b) => a.order - b.order).map(hitState => hitState.record);
    }).catch(error => {
      // Retry only while the environment still exists; a completed stop keeps the same Promise/result.
      if (registrations.has(registration)) stopPromise = undefined;
      throw error;
    });
    return stopPromise;
  }
  // open installs and enables the breakpoint; callback state must already be ready.
  // Local references keep onHit/onFinish alive during installation; registrations retains them afterward.
  // Native code rolls back failed installation without dispatching JS hits, so only check the error code.
  const output = Memory.alloc(Process.pointerSize);
  check(api.open(Java.vm.handle, method.handle, Memory.allocUtf8String(returnType),
    definition.breakpoint.fileLine, onHit, onFinish, output), 'Register debugger');
  handle = output.readPointer();
  registrations.add(registration);
  return stop;
}

// Public entry: Java.performNow supplies a JNI context without switching to the Android main thread.
export async function debuggerProbe(definition) {
  if (isInBreakpointCallback()) throw new Error('Do not register a debugger from a breakpoint callback');
  if (shuttingDown) throw new Error('Debugger runtime is shutting down');
  if (!definition.breakpoint || !Number.isSafeInteger(definition.breakpoint.fileLine) || definition.breakpoint.fileLine < 1) {
    throw new Error('breakpoint requires a positive fileLine');
  }
  if (definition.stack !== undefined && (!Number.isInteger(definition.stack) || definition.stack < 1 || definition.stack > 0x7fffffff)) {
    throw new Error('stack must be a positive 32-bit integer');
  }
  const condition = definition.breakpoint.condition;
  if (condition !== undefined && typeof condition !== 'function') throw new Error('condition must be a function');
  for (const key of ['observations', 'overrides']) {
    const entries = definition[key];
    if (entries !== undefined && (!entries || typeof entries !== 'object' || Array.isArray(entries))) {
      throw new Error(`${key} must be an object`);
    }
  }
  for (const source of Object.values(definition.observations ?? {})) {
    if (typeof source !== 'string' && typeof source !== 'function') throw new Error('Observation must be a name or function');
  }
  for (const fn of [condition, ...Object.values(definition.observations ?? {}),
    ...Object.values(definition.overrides ?? {}), definition.earlyReturn]) {
    if (typeof fn === 'function') requireSynchronous(fn);
  }

  let stop;
  Java.performNow(() => { stop = install(definition); });
  return stop;
}

// SDK cleanup on normal disconnect: reject new registrations, then dispose existing ones.
export async function stopDebuggers() {
  shuttingDown = true;
  // Attempt every registration even if another one fails to stop.
  const results = await Promise.allSettled([...registrations].map(registration => registration.stop()));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}
