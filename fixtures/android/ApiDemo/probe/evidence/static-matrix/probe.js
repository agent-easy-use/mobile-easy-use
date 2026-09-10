const base = 'com.agenteasyuse.mobileeasyuse.apidemo.';
const matrixClass = base + 'state.StaticHookMatrixFixture';
const perform = fn => new Promise((resolve, reject) => Java.perform(() => {
  try { resolve(fn()); } catch (error) { reject(error); }
}));
const main = fn => new Promise((resolve, reject) => Java.scheduleOnMainThread(() => {
  try { resolve(fn()); } catch (error) { reject(error); }
}));
let used = false;

function select(key) {
  const definitions = [
    ['integer', ['int'], [5], '12', 0],
    ['bool', ['boolean'], [false], 'true', false],
    ['wide', ['long'], [10000000000], '10000000007', 0],
    ['consume', ['java.lang.String'], ['probe'], null, undefined],
    ['overloaded', ['int'], [5], 'int:5', 'guard'],
    ['overloaded', ['java.lang.String'], ['probe'], 'string:probe', 'guard'],
    ['locked', ['int'], [5], '12', 0],
    ['recursive', ['int'], [2], '3', 0],
    ['fail', [], [], null, 'guard'],
    ['integer', ['int'], [5], '12', 0],
    ['integer', ['int'], [5], '12', 0],
  ];
  if (/^m\d+$/.test(key)) {
    const index = Number(key.slice(1));
    const [name, types, args, expected, guardValue] = definitions[index];
    const suffix = index === 9 ? '$Plain' : index === 10 ? '$Initialized' : '';
    const C = Java.use(matrixClass + suffix);
    const Matrix = Java.use(matrixClass);
    return { C, name, types, args, expected, guardValue, index,
      readCount: () => Number(Matrix.calls(index)),
      javaCall: () => Matrix.invoke(index),
      expectedCalls: index === 7 ? 3 : 1,
      expectedException: index === 8 ? 'STATIC_MATRIX_EXPECTED' : null };
  }
  if (key === 'resolution-target') {
    const C = Java.use(base + 'state.StaticResolutionFixture');
    return { C, name: 'target', types: ['java.lang.String'], args: ['probe'], expected: 'original:probe',
      guardValue: 'guard', readCount: () => Number(C.getCalls()), javaCall: () => C.invokeTarget('probe') };
  }
  if (key === 'sdk-value') {
    const C = Java.use(base + 'state.SdkFixtureState');
    return { C, name: 'staticValue', types: [], args: [], expected: 'static-original', guardValue: 'guard',
      readCount: () => Number(C.getInstance().getOriginalCallCount('staticValue')) };
  }
  const singleton = { 'sdk-instance': 'SdkFixtureState', 'state-instance': 'ApiDemoState', 'chain-instance': 'ChainCaptureFixture' }[key];
  if (singleton) {
    const className = base + 'state.' + singleton;
    return { C: Java.use(className), name: 'getInstance', types: [], args: [], expected: className,
      guardValue: null, objectResult: true };
  }
  if (key === 'controller-generation' || key === 'controller-activity') {
    const S = Java.use(base + 'state.ApiDemoState');
    const name = key === 'controller-generation' ? 'getGeneration' : 'getActivity';
    return { C: Java.use(base + 'control.ApiDemoController'), name, types: [], args: [],
      expected: String(S.getInstance()[name]()), guardValue: key === 'controller-generation' ? -99 : 'guard' };
  }
  if (key === 'ui-dp') {
    const context = Java.use('android.app.ActivityThread').currentApplication();
    const density = Number(context.getResources().getDisplayMetrics().density.value);
    return { C: Java.use(base + 'ui.UiFactory'), name: 'dp', types: ['android.content.Context', 'int'],
      args: [context, 10], expected: String(Math.floor(10 * density + 0.5)), guardValue: -99 };
  }
  throw Error('Unknown case: ' + key);
}

export async function probeStaticMethod(options) {
  if (typeof options === 'string') options = JSON.parse(options);
  if (used) throw Error('Each case requires a cold process');
  used = true;
  const { key, preparation = 'none', trigger = 'wrapper', behavior = 'original' } = options;
  let method;
  let installed = false;
  return await perform(async () => {
    const run = () => {
      const c = select(key);
      method = c.C[c.name].overload(...c.types);
      let entries = 0, depth = 0, maxDepth = 0, guarded = false, originalReturns = 0;
      const events = [];
      const serialize = value => value === undefined || value === null ? null :
        c.objectResult ? value.$className : String(value);
      let baseline = 0, warmResult = null;
      if (preparation === 'initialize') {
        Java.use('java.lang.Class').forName(c.C.$className, true, c.C.class.getClassLoader());
      }
      if (preparation === 'warm') {
        try { warmResult = serialize(method.call(c.C, ...c.args)); }
        catch (e) { if (!c.expectedException || !String(e).includes(c.expectedException)) throw e; }
      }
      if (preparation !== 'none' && c.readCount) baseline = c.readCount();
      if (method.implementation !== null) throw Error('Hook already installed');
      method.implementation = function (...args) {
        entries++; depth++; maxDepth = Math.max(maxDepth, depth);
        events.push({ phase: 'enter', depth, argument: c.name === 'recursive' ? Number(args[0]) : null });
        try {
          if (behavior === 'constant') return c.guardValue;
          if (depth >= (c.index === 7 ? 5 : 2)) { guarded = true; return c.guardValue; }
          const value = method.call(this, ...args);
          originalReturns++;
          return value;
        } finally { events.push({ phase: 'leave', depth }); depth--; }
      };
      installed = true;
      const quick = method._r._m.originalMethod.quickCode;
      const savedEntry = { address: quick.toString(), symbol: DebugSymbol.fromAddress(quick).toString() };
      let value = null, exception = null;
      try {
        value = serialize(trigger === 'java' ? c.javaCall() : method.call(c.C, ...c.args));
      } catch (e) { exception = String(e); }
      finally { method.implementation = null; installed = false; }
      const originalCalls = c.readCount ? c.readCount() - baseline : null;
      const expectedCalls = behavior === 'constant' ? 0 : c.expectedCalls ?? 1;
      const resultCorrect = behavior === 'constant' ? value === serialize(c.guardValue) :
        c.expectedException ? exception !== null && exception.includes(c.expectedException) :
          exception === null && value === c.expected;
      const expectedEntries = behavior === 'constant' ? 1 : c.expectedCalls ?? 1;
      const status = guarded ? 'reentry' : entries === 0 ? 'bypassed' :
        resultCorrect && entries === expectedEntries && (originalCalls === null || originalCalls === expectedCalls) ? 'normal' : 'inconclusive';
      return { pid: Process.id, fridaVersion: Frida.version, bridgeVersion: '7.0.12', runtime: Script.runtime,
        options, className: c.C.$className, method: c.name, types: c.types, savedEntry,
        status, entries, maxDepth, guarded, originalReturns, originalCalls, baseline, warmResult,
        value, exception, expected: c.expected, expectedCalls, isMainThread: Java.isMainThread(), events };
    };
    try { return options.thread === 'main' || key === 'ui-dp' ? await main(run) : run(); }
    finally { if (installed) await perform(() => { method.implementation = null; }); }
  });
}
