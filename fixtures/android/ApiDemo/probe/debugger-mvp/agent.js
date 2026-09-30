import Java from 'frida-java-bridge';
import { Probe } from '../../../../../sdk/android/probe/index.js';
import { stopDebuggers } from '../../../../../sdk/android/probe/debugger/index.js';
import { types } from './cases.js';
import { conversions, cleanupEvidence } from './conversions.js';

const target = 'com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerMvpFixture';
let stops = [], owned = [], savedGet, stopping, stopped;
// Test-owned wrappers are separate from the SDK's temporary binding wrappers.
function replacement(type, input) {
  if (input === null) return null;
  if (type.component) {
    const component = types.find(item => item.name === type.component);
    return input.map(item => replacement(component, item));
  }
  if (type.name === 'Long') return typeof input === 'number' ? input : new Int64(input);
  if (type.name === 'Float' || type.name === 'Double') return Number(input);
  if (type.name === 'Object') {
    const box = Java.use(type.java).$new();
    box.label.value = input;
    owned.push(box);
    return box;
  }
  return input;
}
function releaseOwned() {
  for (const object of owned) object.$dispose();
  owned = [];
}

function definition(config) {
  if (config.mode === 'conversions') return conversions(config.line, owned);
  const breakpoint = { target, method: config.method ?? 'sequence', fileLine: config.line };
  if (config.argumentTypes) breakpoint.argumentTypes = config.argumentTypes;
  if (config.classTarget) breakpoint.target = Java.use(target);
  const spec = { breakpoint };
  if (config.type) {
    const type = types.find(item => item.name === config.type);
    const values = type ? (config.values ?? type.values).map(input => replacement(type, input)) : [undefined];
    let i = 0;
    if (config.operation === 'field') {
      breakpoint.target += '$FieldTypes';
      breakpoint.method = 'read';
      spec.observations = { before: 'field' + config.type };
      spec.overrides = { ['field' + config.type]: () => values[i++] };
      return spec;
    }
    breakpoint.method = 'type' + config.type;
    if (config.type !== 'Void') spec.observations = { argument: 'value', local: 'local' };
    if (config.operation === 'return') spec.earlyReturn = () => values[i++];
    else spec.overrides = { [config.operation === 'local' ? 'local' : 'value']: () => values[i++] };
    return spec;
  }
  if (config.mode.startsWith('text-')) {
    breakpoint.method = 'text' + config.textType;
    spec.observations = { value: 'value', local: 'local', text: ({get}) => { const v = get('value'); return v === null ? null : v.toString(); }, kind: ({get}) => get('value') === null ? 'null' : typeof get('value') };
    if (config.mode === 'text-write') spec.overrides = { value: '中文🙂', local: '' };
    if (config.mode === 'text-return') spec.earlyReturn = '返回🙂';
    if (config.mode === 'text-boxed-write') spec.overrides = { value: () => { const v = Java.use('java.lang.String').$new('中文🙂'); owned.push(v); return v; } };
    if (config.mode === 'text-boxed-return') spec.earlyReturn = () => { const v = Java.use('java.lang.String').$new('返回🙂'); owned.push(v); return v; };
    return spec;
  }
  if (['names', 'fields', 'bad-fields', 'this-write', 'shadow', 'scope-in', 'scope-out'].includes(config.mode)) {
    breakpoint.target += config.mode === 'shadow' ? '$Parent' : '$Counter';
    breakpoint.method = config.mode === 'shadow' ? 'parentRead' : config.mode.startsWith('scope-') ? 'scoped' : 'update';
    spec.observations = config.mode.startsWith('scope-') ? { count: 'count' }
      : config.mode === 'shadow' ? { hidden: 'hidden' }
      : { count: 'count', local: 'local', field: ({get}) => get('this').count.value,
          amount: 'amount', inherited: 'inherited', owner: 'this' };
    if (config.mode === 'names') spec.overrides = { count: 5, local: 7 };
    if (config.mode === 'fields') spec.overrides = { amount: 20, inherited: 4, text: '中文🙂', flag: true, items: null };
    if (config.mode === 'bad-fields') spec.overrides = { amount: 'bad', items: 'bad' };
    if (config.mode === 'this-write') spec.overrides = { this: null };
    return spec;
  }
  if (config.mode === 'no-locals') {
    breakpoint.target = target.replace('DebuggerMvpFixture', 'DebuggerNoLocalsFixture');
    breakpoint.method = 'call';
    spec.observations = { owner: 'this', field: ({get}) => get('this').count.value, count: 'count' };
    spec.overrides = { count: 10 };
    return spec;
  }
  switch (config.mode) {
    case 'stages': spec.observations = { before: 'input', computed: ({get}) => get('input') + get('local') };
      spec.overrides = { input: 40 }; spec.earlyReturn = ({get}) => get('input') + get('local'); spec.stack = 3; break;
    case 'read': spec.observations = { value: 'input', local: 'local' }; break;
    case 'overloaded': breakpoint.method = 'overloaded'; spec.observations = { value: 'value' };
      spec.overrides = { value: 40 }; break;
    case 'override-only': spec.overrides = { input: 40 }; break;
    case 'return-only': spec.earlyReturn = 777; break;
    case 'stack-only': spec.stack = 2; break;
    case 'empty': break;
    case 'condition': breakpoint.condition = ({get}) => get('input') > 2; spec.observations = { value: 'input' }; break;
    case 'condition-false': breakpoint.condition = () => false; spec.overrides = { input: 40 }; spec.earlyReturn = 777; break;
    case 'condition-error': breakpoint.condition = () => { throw Error('condition-failure'); }; spec.overrides = { input: 40 }; break;
    case 'condition-type': breakpoint.condition = () => 1; break;
    case 'observation-errors': spec.observations = {
      absent: 'absent', path: 'this.count', receiver: 'this',
      promise: () => Promise.resolve(1), cycle: () => { const x = {}; x.x = x; return x; },
      failure: () => { throw Error('observation-failure'); }, good: 'input', nil: () => null,
    }; spec.overrides = { input: 40 }; spec.earlyReturn = ({get}) => get('input'); break;
    case 'override-errors': spec.overrides = { input: 40, local: 'bad', absent: 1 }; spec.earlyReturn = 777; break;
    case 'isolated-errors': {
      let computed = 0;
      spec.observations = { failure: () => { throw Error('observation-failure'); }, good: 'input' };
      spec.overrides = {
        this: () => { computed++; return null; },
        absent: () => { computed++; throw Error('override-failure'); },
        input: 40,
      };
      spec.earlyReturn = ({get}) => get('input') + computed;
      break;
    }
    case 'return-error': spec.overrides = { input: 40 }; spec.earlyReturn = 'bad'; break;
    case 'java-iterator': spec.observations = { iterator: () => {
      const list = Java.use('java.util.ArrayList').$new();
      const iterator = list.iterator(); owned.push(list, iterator); return iterator;
    } }; break;
    case 'shared-get': spec.observations = { save: ({get}) => { savedGet = get; return 1; },
      again: () => savedGet('input'), good: 'input' }; break;
    case 'inflight': spec.observations = { gate: () => { Java.use(target).awaitGate(); return 'released'; } }; break;
    case 'reentrant': spec.observations = { nested: () => Java.use(target).sequence(9), value: 'input' }; break;
    case 'concurrent': spec.observations = { value: 'input' }; break;
    case 'async': spec.observations = { bad: async () => 1 }; break;
    case 'generator': spec.overrides = { input: function* () { yield 1; } }; break;
    case 'async-generator': spec.earlyReturn = async function* () { yield 1; }; break;
    case 'async-condition': breakpoint.condition = async () => true; break;
    case 'bad-stack': spec.stack = config.depth; break;
    case 'bad-observation': spec.observations = { x: {kind: 'stack'} }; break;
    case 'bad-line': breakpoint.fileLine = 999999; break;
  }
  return spec;
}

rpc.exports = {
  async configure(config) {
    let spec;
    Java.performNow(() => { Java.use(target).reset(); spec = definition(config); });
    stops.push(await Probe.debugger(spec));
  },
  cleanupEvidence() { let r; Java.performNow(() => { r = cleanupEvidence(); }); return r; },
  directField(typeName, inputs) {
    let results;
    Java.performNow(() => {
      const type = types.find(t => t.name === typeName);
      results = inputs.map(input => {
        const instance = Java.use(target + '$FieldTypes').$new();
        owned.push(instance);
        try { instance['field' + typeName].value = replacement(type, input); return {value: instance.read(typeName)}; }
        catch (e) { return {rejected: true}; }
      });
    });
    return results;
  },
  trigger(mode, count) { Java.performNow(() => Java.use(target).start(mode, count)); },
  poll() {
    let state;
    Java.performNow(() => { const f = Java.use(target); state = { result: f.result.value, entered: f.entered.value }; });
    return state;
  },
  expiredGet() {
    try { savedGet('input'); return null; } catch (error) { return error.message; }
  },
  stop() { return stops[stops.length - 1](); },
  reset() { Java.performNow(() => Java.use(target).reset()); },
  releaseValues() { Java.performNow(releaseOwned); },
  beginStop() { stopped = false; stopping = stops[stops.length - 1]().then(hits => { stopped = true; return hits; }); },
  stopState() { return stopped; },
  finishStop() { return stopping; },
  release() { Java.performNow(() => Java.use(target).releaseGate()); },
  async dispose() {
    Java.performNow(() => Java.use(target).releaseGate());
    await stopDebuggers();
    Java.performNow(releaseOwned);
  },
};
