import { installDebugger } from '../common/debugger.js';
import { safeEmit } from '../common/reporting.js';

const locations = new Set();

export async function code(definition, overrides, earlyReturn) {
  const values = codeOverrides(overrides, earlyReturn);
  if (earlyReturn !== undefined && (typeof earlyReturn !== 'string' || !earlyReturn.trim())) {
    throw new TypeError('earlyReturn must be a non-empty native expression; use (id)nil instead of null');
  }
  if (!definition || 'target' in definition) throw new TypeError('code requires a source location or address');
  const breakpoint = definition.kind === 'source'
    ? { kind: 'source', file: definition.file, line: definition.line }
    : { kind: definition.kind, address: definition.address };
  if (definition.condition !== undefined) breakpoint.condition = definition.condition;
  const key = definition.kind === 'source' ? `${definition.file}:${definition.line}` : String(definition.address).toLowerCase();
  if (locations.has(key)) throw new Error('Code location already has an override');
  locations.add(key);
  try {
    // Attachment remains explicit until debugger lifecycle ownership is defined.
    const stop = await installDebugger({
      breakpoint, overrides: values,
      ...(earlyReturn === undefined ? {} : { earlyReturn }),
    });
    let removed = false;
    return async () => {
      if (removed) return;
      removed = true;
      const records = await stop();
      safeEmit('override.code', { location: breakpoint, records });
      locations.delete(key);
    };
  } catch (error) {
    locations.delete(key);
    throw error;
  }
}

function codeOverrides(values, earlyReturn) {
  if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values))) {
    throw new TypeError('overrides must be a variable mapping');
  }
  const copy = { ...values };
  if (!Object.keys(copy).length && earlyReturn === undefined) {
    throw new Error('Provide overrides or earlyReturn');
  }
  return copy;
}
