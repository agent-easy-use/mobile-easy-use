import { requestController } from '../../common/controller.js';

let state = 'detached';
let generation = 0;
let sequence = 0;
let attaching;

function expression(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Expected non-empty LLDB expression');
  return value;
}

// Copy only the public configuration. Code strings reach LLDB unchanged.
function configuration(definition) {
  const breakpoint = { ...definition.breakpoint };
  if (breakpoint.kind === 'source') {
    if (typeof breakpoint.file !== 'string' || !breakpoint.file.startsWith('/')
        || !Number.isSafeInteger(breakpoint.line) || breakpoint.line < 1) {
      throw new TypeError('Source breakpoints require an absolute Host file and a positive line');
    }
  } else if (breakpoint.kind !== 'address' || !/^0x[0-9a-f]+$/i.test(breakpoint.address)) {
    throw new TypeError('breakpoint must be source or address');
  }
  if (breakpoint.condition !== undefined) expression(breakpoint.condition);
  const result = { breakpoint };
  for (const field of ['capture', 'overrides']) {
    if (definition[field] === undefined) continue;
    const values = definition[field];
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError(`${field} must be an object`);
    result[field] = Object.fromEntries(Object.entries(values).map(([name, code]) => [name, expression(code)]));
  }
  if (definition.stack !== undefined) {
    if (!Number.isInteger(definition.stack) || definition.stack < 1 || definition.stack > 256) {
      throw new TypeError('stack must be an integer from 1 to 256');
    }
    result.stack = definition.stack;
  }
  if (definition.earlyReturn !== undefined) result.earlyReturn = expression(definition.earlyReturn);
  return result;
}

export async function requestDebugger(action, payload) {
  const reply = await requestController(`ios.debugger.${action}`, payload, 120000);
  if (!reply.ok) throw new Error(reply.responsePayload?.error?.message ?? 'Debugger request failed');
  return reply.responsePayload;
}

// Session lifecycle is internal; public code APIs attach on demand.
async function attachDebugger() {
  if (state !== 'detached') throw new Error('Detach the current debugger session before attaching');
  state = 'attaching';
  try {
    const result = await requestDebugger('attach', { pid: Process.id });
    state = 'attached';
    return result;
  } catch (error) {
    state = 'failed';
    throw error;
  }
}

async function detachDebugger() {
  if (state === 'detached') return;
  if (state === 'attaching' || state === 'detaching') throw new Error('Debugger lifecycle operation is in progress');
  state = 'detaching';
  try {
    await requestDebugger('detach', {});
    generation++;
    state = 'detached';
  } catch (error) {
    state = 'failed';
    throw error;
  }
}

export async function installDebugger(definition) {
  await ensureDebugger();
  const config = configuration(definition);
  const id = `debugger-${++sequence}`;
  const session = generation;
  await requestDebugger('add', { id, definition: config });
  let stopping;
  // Cache the reply, not live records. Concurrent/repeated stop calls share one request.
  return () => {
    if (stopping) return stopping;
    if (session !== generation || state !== 'attached') return Promise.reject(new Error('Debugger session ended before records were collected'));
    stopping = requestDebugger('remove', { id }).catch(error => { stopping = undefined; throw error; });
    return stopping;
  };
}

// Code APIs share the same attachment and concurrent first callers.
export async function ensureDebugger() {
  if (state === 'attached') return;
  if (!attaching) {
    attaching = (async () => {
      if (state === 'failed') await detachDebugger();
      await attachDebugger();
    })().finally(() => { attaching = undefined; });
  }
  await attaching;
}
