import Java from 'frida-java-bridge';

const target = 'com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerMvpFixture';
let originals = [], retained, cloned, external;

export function conversions(line, owned) {
  external = Java.use(target + '$Parent').$new();
  owned.push(external);
  return {
    breakpoint: {target: target + '$Conversions', method: 'run', fileLine: line},
    observations: {
      compare: ({get}) => {
        const owner = get('this');
        function view(v) {
          if (v === null) return null;
          if (Array.isArray(v)) return v.map(view);
          if (v.$h && v.length !== undefined) return Array.from({length: v.length}, (_, i) => v[i]);
          if (v.$h) return {className: v.$className, text: typeof v.text,
            hidden: v.hidden === undefined ? null : v.hidden.value};
          return v;
        }
        const debug = {}, frida = {};
        for (const name of ['concrete', 'parent', 'object', 'objects', 'nested', 'ints', 'names']) {
          debug[name] = view(get(name));
          const direct = owner[name].value;
          frida[name] = view(direct);
          if (direct?.$dispose) owned.push(direct);
        }
        return {debug, frida, castText: Java.cast(get('object'), Java.use(target + '$Counter')).text.value};
      },
      mutation: ({get}) => {
        const ints = get('ints');
        ints[0] = 9;
        const names = get('names');
        names[0] = 'js-only';
        const objects = get('objects'), nested = get('nested');
        originals = [objects[0], objects.$w, nested[0][0], nested[0].$w, nested.$w];
        retained = Java.retain(objects[0]);
        cloned = ints.$clone(Java.vm.getEnv());
        owned.push(retained, cloned);
        objects[0] = external;
        nested[0] = [external];
        return {ints: [ints[0], ints[1]], names};
      },
    },
  };
}

export function cleanupEvidence() {
  return {
    disposed: originals.map(value => value.$h === undefined),
    retained: retained.hidden.value,
    cloned: [cloned[0], cloned[1]],
    external: external.hidden.value,
  };
}
