// Internal, operation-scoped capture. No resources are installed at module load.
import Java from 'frida-java-bridge';
const METRICS = ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes'];
function makeBackend(timing, metrics) {
  const System = timing ? Java.use('java.lang.System') : null;
  const runtime = metrics.includes('javaHeapUsedBytes') ? Java.use('java.lang.Runtime').getRuntime() : null;
  const Debug = metrics.includes('nativeHeapAllocatedBytes') ? Java.use('android.os.Debug') : null;
  return {
    now: () => BigInt(System.nanoTime().toString()),
    memory: metric => metric === 'javaHeapUsedBytes'
      ? Number(runtime.totalMemory().toString()) - Number(runtime.freeMemory().toString())
      : Number(Debug.getNativeHeapAllocatedSize().toString()),
  };
}

function jsonSnapshot(value) {
  const seen = new Set();
  function check(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || seen.has(item)) throw new Error('capture must return finite, acyclic plain JSON data');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
      throw new Error('capture must return plain JSON data, not runtime wrappers');
    }
    seen.add(item);
    for (const child of Object.values(item)) check(child);
    seen.delete(item);
  }
  check(value);
  return JSON.parse(JSON.stringify(value));
}

export function createCapture(config) {
  if (config === undefined) return null;
  if (config === null || typeof config !== 'object' || Array.isArray(config)) throw new Error('capture must be an object');
  for (const key of Object.keys(config)) {
    if (!['args', 'result', 'timing', 'memory', 'stack'].includes(key)) throw new Error(`Unknown capture option: ${key}`);
  }
  for (const key of ['args', 'result']) {
    if (config[key] !== undefined && typeof config[key] !== 'function') throw new Error(`capture.${key} must be a function`);
  }
  if (config.timing !== undefined && typeof config.timing !== 'boolean') throw new Error('capture.timing must be boolean');
  let metrics = [];
  if (config.memory !== undefined) {
    if (!config.memory || !Array.isArray(config.memory.metrics) || config.memory.metrics.length === 0) {
      throw new Error('capture.memory.metrics must be a non-empty array');
    }
    metrics = [...new Set(config.memory.metrics)];
    for (const metric of metrics) if (!METRICS.includes(metric)) throw new Error(`Unsupported memory metric: ${metric}`);
  }
  let stackDepth = 0;
  if (config.stack !== undefined && config.stack !== false) {
    const stack = config.stack;
    if (stack !== true && (stack === null || typeof stack !== 'object' || Array.isArray(stack)
      || Object.keys(stack).some(key => key !== 'maxFrames'))) {
      throw new Error('capture.stack must be boolean or {maxFrames?: number}');
    }
    stackDepth = stack === true ? 5 : (stack.maxFrames === undefined ? 5 : stack.maxFrames);
    if (!Number.isSafeInteger(stackDepth) || stackDepth < 1 || stackDepth > MAX_STACK_FRAMES) {
      throw new Error(`capture.stack.maxFrames must be an integer from 1 to ${MAX_STACK_FRAMES}`);
    }
  }
  if (stackDepth) prepareStackBackend();
  const args = config.args;
  const result = config.result;
  const timing = config.timing === true;
  let backend;
  const getBackend = () => backend ??= makeBackend(timing, metrics);
  function attempt(state, field, work) {
    try { return work(); }
    catch (error) {
      (state.output.captureErrors ??= []).push({ field, message: String(error.message ?? error) });
      return undefined;
    }
  }
  function memory(state, checkpoint) {
    for (const metric of metrics) {
      const entry = state.output.memory[metric];
      const value = attempt(state, `memory.${metric}.${checkpoint}`, () => {
        const value = getBackend().memory(metric);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Memory value is not a non-negative safe integer');
        return value;
      });
      entry[checkpoint] = value ?? null;
      if (checkpoint === 'after') entry.delta = entry.before === null || entry.after === null ? null : entry.after - entry.before;
    }
  }
  return {
    begin(invocation, emitEnter, context) {
      const state = { output: {}, start: undefined };
      if (args) {
        const value = attempt(state, 'args', () => jsonSnapshot(args(invocation())));
        if (value !== undefined) state.output.args = value;
      }
      if (stackDepth) {
        const value = attempt(state, 'stack', () => readStack(stackDepth, context));
        if (value !== undefined) state.output.stack = value;
      }
      // Publish the entry snapshot before the original method starts, including failures.
      emitEnter(Object.keys(state.output).length ? state.output : undefined);
      state.output = {};
      if (metrics.length) {
        state.output.memory = Object.fromEntries(metrics.map(metric => [metric, { unit: 'bytes', before: null, after: null, delta: null }]));
        memory(state, 'before');
      }
      // Initialize bindings before reading the start clock.
      if (timing) state.start = attempt(state, 'timing.start', () => getBackend().now());
      return state;
    },
    end(state) {
      // Stop before memory reads, result extraction, serialization and evidence output.
      if (timing) {
        const end = attempt(state, 'timing.end', () => getBackend().now());
        if (end !== undefined && state.start !== undefined) {
          const elapsed = end - state.start;
          if (elapsed >= 0n) state.output.elapsedMs = Number(elapsed) / 1e6;
          else attempt(state, 'timing', () => { throw new Error('Monotonic clock moved backwards'); });
        }
      }
      memory(state, 'after');
    },
    finish(state, invocation, succeeded) {
      if (result && succeeded) {
        const value = attempt(state, 'result', () => jsonSnapshot(result(invocation())));
        if (value !== undefined) state.output.result = value;
      }
      return state.output;
    },
  };
}

const MAX_STACK_FRAMES = 64;
function readStack(maxFrames) {
  return {
    kind: 'java',
    frames: Java.backtrace({ limit: maxFrames }).frames.slice(0, maxFrames).map(frame => ({
      className: frame.className,
      methodName: frame.methodName,
      signature: frame.signature,
      fileName: frame.fileName ?? null,
      lineNumber: frame.lineNumber ?? null,
    })),
  };
}

let stackBackendPrepared = false;
function prepareStackBackend() {
  if (stackBackendPrepared) return;
  // frida-java-bridge lazily creates a global CModule for Java.backtrace().
  // Initialize it during serial hook installation, before concurrent app threads
  // can race its first use and release an overwritten module's native callbacks.
  try {
    Java.backtrace({limit: 1});
    stackBackendPrepared = true;
  } catch (_) {
    // Entry-side capture will report the actual failure through captureErrors.
  }
}
