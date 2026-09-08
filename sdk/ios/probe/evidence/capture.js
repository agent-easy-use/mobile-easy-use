// Internal, operation-scoped capture. No resources are installed at module load.
const METRICS = ['physicalFootprintBytes'];
function makeBackend(timing, metrics) {
  if (Process.pointerSize !== 8 || !['arm64', 'x64'].includes(Process.arch)) {
    throw new Error('iOS capture requires arm64 or x64');
  }
  const bind = (name, ret, args) => new NativeFunction(Module.getGlobalExportByName(name), ret, args);
  // Darwin time.h: CLOCK_UPTIME_RAW = 8 (monotonic, excludes sleep).
  const clock = timing ? bind('clock_gettime_nsec_np', 'uint64', ['uint']) : null;
  const taskInfo = metrics.length ? bind('task_info', 'int', ['uint', 'uint', 'pointer', 'pointer']) : null;
  const taskSelf = metrics.length ? bind('mach_task_self', 'uint', []) : null;
  return {
    now: () => BigInt(clock(8).toString()),
    memory() {
      // mach/task_info.h: TASK_VM_INFO=22, rev1 has 38 natural_t words;
      // phys_footprint is at byte 144. Request only this stable prefix.
      // Per-read buffers avoid concurrent/reentrant calls sharing mutable storage.
      const info = Memory.alloc(152);
      const count = Memory.alloc(4);
      count.writeU32(38);
      const status = taskInfo(taskSelf(), 22, info, count);
      if (status !== 0) throw new Error(`task_info failed: ${status}`);
      if (count.readU32() < 38) throw new Error('TASK_VM_INFO response lacks phys_footprint');
      return Number(info.add(144).readU64().toString());
    },
  };
}

// Interceptor arguments are general-purpose register/stack slots. Reject signatures
// whose ABI needs floating-point or aggregate decoding instead of guessing values.
export function decodeArguments(method, rawArgs) {
  const types = method.argumentTypes;
  if (!Array.isArray(types) || types.some(type => !SUPPORTED_TYPES.includes(type))) {
    throw new Error('capture.args supports only pointer and integer Objective-C signatures');
  }
  return types.slice(2).map((type, index) => decodeValue(type, rawArgs[index + 2]));
}
const SUPPORTED_TYPES = ['pointer', 'bool', 'char', 'uchar', 'int8', 'uint8', 'int16', 'uint16', 'int', 'uint', 'int32', 'uint32', 'long', 'ulong', 'int64', 'uint64'];
export function decodeValue(type, value) {
  if (type === 'void') return undefined;
  if (!SUPPORTED_TYPES.includes(type)) throw new Error(`Unsupported capture ABI type: ${String(type)}`);
  if (type === 'pointer') return ptr(value.toString());
  if (type === 'bool') return (value.toUInt32() & 255) !== 0;
  if (['char', 'int8'].includes(type)) return (value.toInt32() << 24) >> 24;
  if (['uchar', 'uint8'].includes(type)) return value.toUInt32() & 255;
  if (type === 'int16') return (value.toInt32() << 16) >> 16;
  if (type === 'uint16') return value.toUInt32() & 65535;
  if (['int', 'int32'].includes(type)) return value.toInt32();
  if (['uint', 'uint32'].includes(type)) return value.toUInt32();
  const integer = BigInt(value.toString());
  return (['long', 'int64'].includes(type) ? BigInt.asIntN(64, integer) : BigInt.asUintN(64, integer)).toString();
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
        const value = attempt(state, 'args', () => args(invocation()));
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
        const value = attempt(state, 'result', () => result(invocation()));
        if (value !== undefined) state.output.result = value;
      }
      return state.output;
    },
  };
}

// Frida's native unwinder currently returns at most 16 frames.
const MAX_STACK_FRAMES = 16;
function readStack(maxFrames, context) {
  return {
    kind: 'native',
    frames: Thread.backtrace(context, Backtracer.ACCURATE).slice(0, maxFrames).map(address => {
      let symbol;
      try { symbol = DebugSymbol.fromAddress(address); } catch (_) {}
      return {
        address: address.toString(),
        moduleName: symbol?.moduleName ?? null,
        name: symbol?.name ?? null,
        fileName: symbol?.fileName || null,
        lineNumber: symbol?.lineNumber || null,
      };
    }),
  };
}
