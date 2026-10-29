import { debuggerProbe } from '../common/debugger/index.js';
import { safeEmit } from '../common/reporting.js';

export async function code(definition, overrides, earlyReturn) {
  const values = codeOverrides(overrides, earlyReturn);
  if (typeof definition?.className !== 'string' || !definition.className.trim() || 'target' in definition) {
    throw new TypeError('code requires className, not an instance target');
  }
  const stop = await debuggerProbe({
    breakpoint: {
      target: definition.className, method: definition.method,
      argumentTypes: definition.argumentTypes, fileLine: definition.fileLine, condition: definition.condition,
    },
    overrides: values,
    ...(earlyReturn === undefined ? {} : { earlyReturn }),
  });
  let removed = false;
  return async () => {
    if (removed) return;
    removed = true;
    const records = await stop();
    safeEmit('override.code', {
      location: {
        className: definition.className, method: definition.method,
        argumentTypes: definition.argumentTypes, fileLine: definition.fileLine,
      },
      records,
    });
  };
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
