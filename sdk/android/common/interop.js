import Java from 'frida-java-bridge';

const rawByProxy = new WeakMap();

function unwrapJavaValue(value) {
  return rawByProxy.get(value)?.current ?? value;
}

function wrapJavaValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(wrapJavaValue);
  if ((typeof value !== 'object' && typeof value !== 'function')
    || typeof value.$className !== 'string') {
    return value;
  }

  const state = { current: value, promoted: false };
  const proxy = new Proxy(value, {
    get(_target, property) {
      if (property === '$raw') return state.current;

      let member = Reflect.get(state.current, property, state.current);
      if (!state.promoted && (member === undefined || property === 'toString')) {
        state.promoted = true;
        try {
          state.current = Java.cast(
            state.current,
            Java.use(state.current.$className),
          );
          member = Reflect.get(state.current, property, state.current);
        } catch (_) {
          // Keep the declared-type wrapper when its runtime class is unavailable.
        }
      }

      if (typeof member === 'function') {
        return (...args) => wrapJavaValue(
          member.apply(state.current, args.map(unwrapJavaValue)),
        );
      }
      return wrapJavaValue(member);
    },
  });
  rawByProxy.set(proxy, state);
  return proxy;
}

export { unwrapJavaValue, wrapJavaValue };
