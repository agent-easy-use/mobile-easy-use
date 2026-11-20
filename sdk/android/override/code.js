import Java from 'frida-java-bridge';
import { registerBreakpoint } from '../common/debugger/index.js';
import { errorMessage, safeEmit } from '../common/reporting.js';
import { backend, check, takeString, readVariable, trackWrappers, writeVariable, encode } from '../common/debugger/native.js';

const addError = (record, stage, error, name) => {
  (record.errors ??= []).push({ stage, ...(name === undefined ? {} : { name }), message: errorMessage(error) });
};

// Override owns condition evaluation, writes, early return and diagnostic records.
// onFinish records the native completion result after ForceEarlyReturn has run.
export async function code(definition, overrides, earlyReturn) {
  const values = codeOverrides(overrides, earlyReturn);
  if (typeof definition?.className !== 'string' || !definition.className.trim() || 'target' in definition) {
    throw new TypeError('code requires className, not an instance target');
  }
  if (!Number.isSafeInteger(definition.fileLine) || definition.fileLine < 1) {
    throw new Error('breakpoint requires a positive fileLine');
  }
  if (definition.condition !== undefined && typeof definition.condition !== 'function') {
    throw new Error('condition must be a function');
  }
  for (const fn of [definition.condition, ...Object.values(values), earlyReturn]) {
    if (typeof fn === 'function') requireSynchronous(fn);
  }
  let removeOverride;
  Java.performNow(() => {
    const { method, factory } = resolveMethod(definition);
    const api = backend();
    // Frida already provides the return descriptor; prepare it before the first hit without querying C++.
    const returnType = method.returnType.name;
    let hitSequence = 0;

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
    const onHit = hit => {
      const state = { record: makeHit(), order: hitSequence, returning: false, shouldRecord: true };
      pendingHits.set(hit.toString(), state);
      const { record } = state;
      const wrappers = [];
      let active = true;
      const get = name => {
        if (!active) throw new Error('get is only valid during this breakpoint hit');
        const value = readVariable(api, hit, name, factory);
        trackWrappers(value, wrappers);
        return value;
      };
      try {
        record.thread.name = takeString(api, api.thread(hit));
        const condition = definition.condition;
        if (condition !== undefined) {
          try {
            const matched = condition({ get });
            if (typeof matched !== 'boolean') throw new Error('Condition must return boolean');
            if (!matched) { state.shouldRecord = false; return; }
          } catch (error) { addError(record, 'condition', error); return; }
        }
        for (const [name, source] of Object.entries(values)) {
          try {
            const value = typeof source === 'function' ? source({ get }) : source;
            writeVariable(api, hit, name, value, factory);
          } catch (error) { addError(record, 'overrides', error, name); }
        }
        if (earlyReturn !== undefined) {
          try {
            const source = earlyReturn;
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
      }
    };
    // Only native completion can tell us whether ForceEarlyReturn actually succeeded.
    const onFinish = (hit, error) => {
      const key = hit.toString();
      const state = pendingHits.get(key) ?? { record: makeHit(), order: hitSequence, shouldRecord: true };
      pendingHits.delete(key);
      if (error !== 0) {
        try { check(error, 'Complete breakpoint'); }
        catch (cause) { addError(state.record, state.returning ? 'earlyReturn' : 'framework', cause); }
      }
      if (state.shouldRecord) completedHits.push(state);
    };

    const remove = registerBreakpoint(method, definition.fileLine, { onHit, onFinish });
    let removing;
    removeOverride = () => {
      if (!removing) removing = remove().then(() => {
        safeEmit('override.code', {
          location: {
            className: definition.className, method: definition.method,
            argumentTypes: definition.argumentTypes, fileLine: definition.fileLine,
          },
          records: completedHits.sort((a, b) => a.order - b.order).map(hitState => hitState.record),
        });
      }).catch(error => { removing = undefined; throw error; });
      return removing;
    };
  });
  return removeOverride;
}

// The public types define the configuration shape; reject functions that cannot run synchronously.
function requireSynchronous(fn) {
  const kind = Object.prototype.toString.call(fn);
  if (['[object AsyncFunction]', '[object GeneratorFunction]', '[object AsyncGeneratorFunction]'].includes(kind)) {
    throw new Error('Debugger callbacks must be synchronous, not async or generators');
  }
}

// Resolve one exact overload and its ClassLoader factory for Java object type conversions.
function resolveMethod(definition) {
  const target = Java.use(definition.className);
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
