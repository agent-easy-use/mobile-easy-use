import Java from 'frida-java-bridge';

let api;
const errors = {
  '-1': 'No executable location at fileLine in the selected method',
  '-2': 'Binding not found in the current frame',
  '-3': 'Ambiguous local variable at the current location',
  '-4': 'The current Java frame is no longer the breakpoint frame',
  '-5': 'forceReturn was already requested for this hit',
  '-6': 'Debugger callbacks are still active',
  13: 'Thread is not suspended/current', 20: 'Invalid Java object', 23: 'Invalid method',
  24: 'Invalid VM location', 31: 'No stack frame', 32: 'Opaque frame',
  34: 'Type mismatch', 35: 'Invalid variable slot', 98: 'Required ART capability is unavailable',
  99: 'Required JVMTI capability is missing', 101: 'Debug information is absent',
  103: 'Invalid JVMTI argument', 104: 'Native method is unsupported', 110: 'Out of memory',
};
export function check(code, operation) {
  if (code !== 0) throw new Error(`${operation}: ${errors[code] ?? 'JVMTI failure'} (${code})`);
}

/**
 * index.js 与 debugger.cpp 之间的 ABI 适配层，不是 RPC。
 * bind('read', ...) 将 .so 导出的 meu_debug_read 地址包装成可调用的 JS 函数。
 * index.js 则用 NativeCallback 把 JS onHit/onFinish 包装成函数指针，传给 api.open。
 * 因而是双向调用：JS → NativeFunction → C++，C++ → NativeCallback → JS。
 * 下方类型数组描述的是原生参数类型/顺序，必须与 C++ 导出函数签名一致。
 */
export function backend() {
  if (api) return api;
  Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUDebugger').attach();
  const module = Process.getModuleByName('libmobile_easy_use_native.so');
  const bind = (name, result, args = []) => new NativeFunction(module.getExportByName(`meu_debug_${name}`), result, args);
  api = {
    // vm, method, argumentTypes, argumentCount, returnType, line, onHit, onFinish, output
    open: bind('open', 'int', ['pointer', 'pointer', 'pointer', 'int', 'pointer', 'int', 'pointer', 'pointer', 'pointer']),
    close: bind('close', 'int', ['pointer']),
    active: bind('active', 'int', ['pointer']), reentrant: bind('reentrant', 'int', ['pointer']),
    dispose: bind('dispose', 'int', ['pointer']), free: bind('free', 'void', ['pointer']),
    resolve: bind('resolve', 'int', ['pointer', 'pointer', 'int', 'pointer', 'pointer']),
    read: bind('read', 'int', ['pointer', 'int', 'int', 'pointer']),
    write: bind('write', 'int', ['pointer', 'int', 'int', 'pointer']),
    return: bind('return', 'int', ['pointer', 'pointer']),
    cancelReturn: bind('cancel_return', 'void', ['pointer']),
    thread: bind('thread', 'pointer', ['pointer']),
    stack: bind('stack', 'int', ['pointer', 'int', 'pointer']),
  };
  return api;
}

export function takeString(api, pointer) {
  if (pointer.isNull()) return null;
  try { return pointer.readUtf8String(); } finally { api.free(pointer); }
}

/**
 * Read one local or argument from the current breakpoint frame.
 * hit is the native Hit* for this callback; source identifies a local name or argument index.
 * Returns { slot, signature, value }: callers use value in JS and keep slot/signature for setBinding.
 * factory uses the target method's ClassLoader. Newly created Java wrappers are added to wrappers
 * so onHit can dispose them when observation processing finishes.
 */
export function readBinding(api, hit, source, factory, wrappers) {
  // resolve writes a slot and an allocated JVM descriptor string through these output pointers.
  const slot = Memory.alloc(4), type = Memory.alloc(Process.pointerSize);
  // A non-null name selects local lookup; a null name selects lookup by argument index.
  const name = source.kind === 'local' ? Memory.allocUtf8String(source.name) : ptr(0);
  check(api.resolve(hit, name, source.index ?? -1, slot, type), 'Resolve binding');
  const signature = takeString(api, type.readPointer());
  // Native read fills an 8-byte jvalue union; the descriptor determines how to decode it.
  const buffer = Memory.alloc(8);
  const binding = { slot: slot.readS32(), signature };
  check(api.read(hit, binding.slot, signature.charCodeAt(0), buffer), 'Read binding');
  switch (signature[0]) {
    // Z/C use GetLocalInt; J stays an Int64 to avoid losing precision in a JS number.
    case 'Z': binding.value = buffer.readS32() !== 0; break;
    case 'C': binding.value = String.fromCharCode(buffer.readS32()); break;
    case 'J': binding.value = buffer.readS64(); break;
    case 'F': binding.value = buffer.readFloat(); break;
    case 'D': binding.value = buffer.readDouble(); break;
    case 'L': case '[': {
      // Objects and arrays arrive as JNI references. Wrap the runtime type for JS field/method access.
      const object = buffer.readPointer();
      if (object.isNull()) { binding.value = null; break; }
      const env = Java.vm.getEnv();
      const className = env.getObjectClassName(object);
      if (className === 'java.lang.String') {
        binding.value = env.stringFromJni(object);
        break;
      }
      binding.value = Java.cast(object, factory.use(className));
      wrappers.push(binding.value);
      break;
    }
    // B/S/I (byte/short/int) are returned through GetLocalInt as signed 32-bit values.
    case 'B': case 'S': case 'I': binding.value = buffer.readS32(); break;
    default: throw new Error(`Unsupported JVM type: ${signature}`);
  }
  return binding;
}

/**
 * Encode a JS value as an 8-byte jvalue for setBinding or forceReturn.
 * signature is the destination's JVM descriptor, not a type inferred from value.
 * This only validates and encodes; the caller passes the buffer to native write/return.
 * factory resolves Java types; wrappers collects any Java String wrapper created here for cleanup.
 */
export function encode(value, signature, factory, wrappers) {
  const buffer = Memory.alloc(8);
  const range = (min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Value does not fit ${signature}`);
    buffer.writeS32(value);
  };
  switch (signature[0]) {
    // Void has no payload. Small integral types use the int member consumed by native code.
    case 'V': if (value !== undefined) throw new Error('void forceReturn requires no value'); break;
    case 'Z': if (typeof value !== 'boolean') throw new Error('Expected boolean'); buffer.writeS32(value ? 1 : 0); break;
    case 'B': range(-128, 127); break;
    case 'S': range(-32768, 32767); break;
    case 'I': range(-2147483648, 2147483647); break;
    case 'C':
      // Java char is one UTF-16 code unit, not necessarily a complete Unicode code point.
      if (typeof value !== 'string' || value.length !== 1) throw new Error('Expected one UTF-16 code unit for char');
      buffer.writeS32(value.charCodeAt(0)); break;
    case 'J':
      // Reject imprecise JS numbers; Int64 preserves the full Java long range.
      if (!(value instanceof Int64) && !Number.isSafeInteger(value)) throw new Error('long requires Int64 or a safe integer');
      buffer.writeS64(value); break;
    case 'F': case 'D':
      if (typeof value !== 'number') throw new Error('Expected number');
      if (signature === 'F') buffer.writeFloat(value); else buffer.writeDouble(value);
      break;
    case 'L': case '[': {
      // Convert JS strings explicitly, then check reference assignment against the destination type.
      if (value === null) { buffer.writePointer(ptr(0)); break; }
      if (typeof value === 'string') {
        value = factory.use('java.lang.String').$new(value);
        wrappers.push(value);
      }
      if (!value?.$h) throw new Error('Expected a Java object or null');
      const className = signature[0] === 'L' ? signature.slice(1, -1).replaceAll('/', '.') : signature.replaceAll('/', '.');
      if (!factory.use(className).class.isInstance(value)) throw new Error(`Object is not assignable to ${className}`);
      // Store a JNI reference, not object bytes. Native return creates its own global ref if needed
      // to keep the object alive until the deferred ForceEarlyReturn call.
      buffer.writePointer(value.$h); break;
    }
    default: throw new Error(`Unsupported JVM type: ${signature}`);
  }
  return buffer;
}

// Evidence must outlive the callback. Never retain a Java handle in a hit record.
export function snapshot(value, seen = new Set()) {
  if (value === undefined) return { type: 'undefined' };
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : { type: 'number', value: String(value) };
  if (value instanceof Int64) return { type: 'long', value: value.toString() };
  if (value?.$h) {
    const env = Java.vm.getEnv();
    const className = env.getObjectClassName(value.$h);
    if (className === 'java.lang.String') {
      return env.stringFromJni(value.$h);
    }
    return { type: 'java-object', className };
  }
  if (value && typeof value.then === 'function') throw new Error('Debugger observations must be synchronous');
  if (typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null && !Array.isArray(value))) {
    throw new Error('Observation must return plain JSON data, Int64, or a Java object');
  }
  if (seen.has(value)) throw new Error('Observation result contains a cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => snapshot(item, seen));
    const out = Object.create(null);
    for (const key of Object.keys(value)) out[key] = snapshot(value[key], seen);
    return out;
  } finally { seen.delete(value); }
}
