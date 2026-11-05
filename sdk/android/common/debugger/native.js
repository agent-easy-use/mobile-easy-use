import Java from 'frida-java-bridge';

let api;
const errors = {
  '-1': 'No executable location at fileLine in the selected method',
  '-2': 'Variable not found in the current frame or receiver',
  '-3': 'Ambiguous local variable at the current location',
  '-4': 'The current Java frame is no longer the breakpoint frame',
  '-5': 'earlyReturn was already requested for this hit',
  '-6': 'Debugger callbacks are still active',
  13: 'Thread is not suspended/current', 20: 'Invalid Java object', 23: 'Invalid method',
  24: 'Invalid VM location', 31: 'No stack frame', 32: 'Opaque frame',
  25: 'Static fields are unsupported', 113: 'JNI field access failed',
  34: 'Type mismatch', 35: 'Invalid variable slot', 98: 'Required ART capability is unavailable',
  99: 'Required JVMTI capability is missing', 101: 'Debug information is absent',
  103: 'Invalid JVMTI argument', 104: 'Native method is unsupported', 110: 'Out of memory',
};
export function check(code, operation) {
  if (code !== 0) throw new Error(`${operation}: ${errors[code] ?? 'JVMTI failure'} (${code})`);
}

/**
 * ABI adapter between index.js and debugger.cpp; this is not RPC.
 * bind('local_read', ...) wraps the exported meu_debug_local_read address as a callable JS function.
 * index.js uses NativeCallback to wrap JS onHit/onFinish as function pointers passed to api.open.
 * Calls flow both ways: JS → NativeFunction → C++, and C++ → NativeCallback → JS.
 * The type arrays below must match the native parameter types and order exactly.
 */
export function backend() {
  if (api) return api;
  Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUDebugger').attach();
  const module = Process.getModuleByName('libmobile_easy_use_native.so');
  const bind = (name, result, args = []) => new NativeFunction(module.getExportByName(`meu_debug_${name}`), result, args);
  api = {
    // vm, method, returnType, line, onHit, onFinish, output
    open: bind('open', 'int', ['pointer', 'pointer', 'pointer', 'int', 'pointer', 'pointer', 'pointer']),
    close: bind('close', 'int', ['pointer']),
    active: bind('active', 'int', ['pointer']), reentrant: bind('reentrant', 'int', ['pointer']),
    dispose: bind('dispose', 'int', ['pointer']), free: bind('free', 'void', ['pointer']),
    resolve: bind('resolve', 'int', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer']),
    receiver: bind('this', 'int', ['pointer', 'pointer']),
    fieldRead: bind('field_read', 'int', ['pointer', 'pointer', 'int', 'pointer']),
    fieldWrite: bind('field_write', 'int', ['pointer', 'pointer', 'int', 'pointer']),
    localRead: bind('local_read', 'int', ['pointer', 'int', 'int', 'pointer']),
    localWrite: bind('local_write', 'int', ['pointer', 'int', 'int', 'pointer']),
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

// A name is an identifier, never an expression or member path.
// Native slot tags: >= 0 = local/parameter, -1 = this, -2 = instance field.
// Only -2 carries a field ID. Negative tags never reach localRead/localWrite.
function resolveVariable(api, hit, name) {
  if (typeof name !== 'string' || !/^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u.test(name)) {
    throw new Error('Expected a variable name or this, not an expression');
  }
  const slot = Memory.alloc(4), type = Memory.alloc(Process.pointerSize), field = Memory.alloc(Process.pointerSize);
  check(api.resolve(hit, Memory.allocUtf8String(name), slot, type, field), `Resolve ${name}`);
  return { slot: slot.readS32(), signature: takeString(api, type.readPointer()), field: field.readPointer() };
}

const primitiveNames = { Z: 'boolean', B: 'byte', C: 'char', S: 'short', I: 'int',
  J: 'long', F: 'float', D: 'double', V: 'void' };

// Descriptors come from JVMTI/Frida. Use Frida's internal converter with its default unboxing.
function valueType(signature, factory) {
  let name;
  if (Object.hasOwn(primitiveNames, signature)) name = primitiveNames[signature];
  else if (signature[0] === 'L') name = signature.slice(1, -1).replaceAll('/', '.');
  else if (signature[0] === '[') name = signature.replaceAll('/', '.');
  else throw new Error(`Unsupported JVM type: ${signature}`);
  return factory._getType(name);
}

// Capture original wrappers before user code can mutate an object array. Never dispose the
// array itself: Frida's array disposer traverses its current, potentially replaced elements.
export function trackWrappers(value, wrappers) {
  if (Array.isArray(value)) {
    for (const element of value) trackWrappers(element, wrappers);
    if (value.$w) wrappers.push(value.$w);
  } else if (value !== null && typeof value?.$dispose === 'function') {
    wrappers.push(value);
  }
}

export function writeVariable(api, hit, name, value, factory) {
  const binding = resolveVariable(api, hit, name);
  if (binding.slot === -1) throw new Error('Cannot replace this');
  const buffer = encode(value, binding.signature, factory);
  const type = binding.signature.charCodeAt(0);
  check(binding.slot === -2 ? api.fieldWrite(hit, binding.field, type, buffer)
    : api.localWrite(hit, binding.slot, type, buffer), 'Write variable');
}

// fromJni creates owned wrappers backed by global references; their lifetime follows JS GC.
export function readVariable(api, hit, name, factory) {
  const { signature, slot, field } = resolveVariable(api, hit, name);
  const type = valueType(signature, factory);
  const buffer = Memory.alloc(8);
  let error;
  if (slot === -1) error = api.receiver(hit, buffer);
  else if (slot === -2) error = api.fieldRead(hit, field, signature.charCodeAt(0), buffer);
  else error = api.localRead(hit, slot, signature.charCodeAt(0), buffer);
  check(error, `Read ${name}`);
  let raw;
  switch (signature[0]) {
    // Our ABI stores all small integral types in a 32-bit slot, including fields.
    case 'Z': case 'B': case 'C': case 'S': case 'I': raw = buffer.readS32(); break;
    case 'J': raw = buffer.readS64(); break;
    case 'F': raw = buffer.readFloat(); break;
    case 'D': raw = buffer.readDouble(); break;
    case 'L': case '[': raw = buffer.readPointer(); break;
    default: throw new Error(`Unsupported JVM type: ${signature}`);
  }
  const value = type.fromJni(raw, Java.vm.getEnv());
  return value;
}

// Frida handles compatibility and conversion; we only adapt the native jvalue layout.
// toJni's temporary local references are released by the native callback's PopLocalFrame.
// Native earlyReturn retains its own global reference before onHit disposes wrappers.
export function encode(value, signature, factory) {
  const type = valueType(signature, factory);
  if (!type.isCompatible(value)) throw new Error(`Value is incompatible with ${type.className}`);
  const raw = type.toJni(value, Java.vm.getEnv());
  const buffer = Memory.alloc(8);
  switch (signature[0]) {
    case 'V': break;
    case 'Z': case 'B': case 'C': case 'S': case 'I': buffer.writeS32(raw); break;
    case 'J': buffer.writeS64(raw); break;
    case 'F': buffer.writeFloat(raw); break;
    case 'D': buffer.writeDouble(raw); break;
    case 'L': case '[': buffer.writePointer(raw); break;
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
