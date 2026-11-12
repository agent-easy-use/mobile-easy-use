import { ensureDebugger, requestDebugger } from '../common/debugger.js';

let sequence = 0;

/**
 * Evaluate native expressions at an LLDB code location. Values are JSON snapshots,
 * not Frida wrappers. current reads cached Host evidence without evaluating again.
 */
async function watch(definition, { capture, stack = 0 } = {}) {
  if (!Number.isInteger(stack) || stack < 0 || stack > 256) throw new TypeError('stack must be an integer from 0 to 256');
  const breakpoint = definition.kind === 'source'
    ? { kind: 'source', file: definition.file, line: definition.line }
    : { kind: definition.kind, address: definition.address };
  if (definition.condition !== undefined) breakpoint.condition = definition.condition;
  await ensureDebugger();
  const id = `inspect-code-${++sequence}`;
  await requestDebugger('add', { id, definition: {
    breakpoint,
    ...(capture === undefined ? {} : { capture: { ...capture } }),
    ...(stack === 0 ? {} : { stack }),
  } });
  let closed = false, stopping, finalResult;
  let cached = { ok: true, data: [], error: null };
  // JSON-only evidence can be copied fully, including nested capture fields.
  const copy = value => JSON.parse(JSON.stringify(value));
  const failed = error => ({ ok: false, data: copy(cached.data), error: String(error?.message ?? error) });
  return {
    async current() {
      if (closed) return { ok: false, data: [], error: 'Code watcher has stopped' };
      try {
        const result = await requestDebugger('current', { id });
        if (!closed) cached = result;
        return copy(result);
      } catch (error) { return failed(error); }
    },
    async stop() {
      closed = true;
      if (finalResult) return copy(finalResult);
      if (!stopping) stopping = requestDebugger('remove', { id }).then(result => {
        cached = finalResult = result;
        return result;
      }).catch(error => { stopping = undefined; return failed(error); });
      return copy(await stopping);
    },
  };
}

export const code = Object.freeze({ watch });
