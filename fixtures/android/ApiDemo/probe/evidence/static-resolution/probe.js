const CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.StaticResolutionFixture';
const GUARD_RESULT = 'diagnostic:reentry-blocked';

/** Run one cold-process comparison; use a separate App process for each combination. */
export async function probeStaticResolution(preparation = 'snapshot', trigger = 'bridge') {
  if (!['snapshot', 'none', 'warm-target'].includes(preparation)) throw Error('Unknown preparation');
  if (!['java', 'reflection', 'bridge'].includes(trigger)) throw Error('Unknown trigger');
  if (!/^com\.agenteasyuse\.mobileeasyuse\.apidemo(?:\.manual)?$/.test(runtimeStatus().appId ?? '')) {
    throw Error('Android ApiDemo with a runtime is required');
  }
  const key = Symbol.for('meu.apidemo.static-resolution.executed');
  if (globalThis[key]) throw Error('Cold-start ApiDemo before another comparison');
  globalThis[key] = true;

  let baselineCalls = 0;
  if (preparation !== 'none') {
    baselineCalls = await AndroidExp.runOnMainThread(() => {
      const fixture = Java.use(CLASS);
      if (fixture.getCalls() !== 0) throw Error('Fixture was already used; cold-start ApiDemo');
      if (preparation === 'warm-target') fixture.target('warmup');
      return Number(fixture.getCalls());
    });
  }

  let method, installed = false, entries = 0, depth = 0, maxDepth = 0, entrypoint = null;
  const events = [];
  try {
    Java.performNow(() => {
      method = Java.use(CLASS).target.overload('java.lang.String');
      if (method.implementation != null) throw Error('Target already has a Hook');
      method.implementation = function (value) {
        entries++;
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        events.push({phase: 'enter', depth});
        try {
          // Do not unhook an executing callback or allow unbounded recursion.
          if (depth >= 2) return GUARD_RESULT;
          return method.call(this, value);
        } finally {
          events.push({phase: 'leave', depth});
          depth--;
        }
      };
      installed = true;
      // Read-only diagnostic for bridge 7.0.12; never patch ArtMethod memory.
      const address = method._r?._m?.originalMethod?.quickCode;
      if (address) entrypoint = {address: String(address), symbol: String(DebugSymbol.fromAddress(address))};
    });
    const observed = await AndroidExp.runOnMainThread(() => {
      const fixture = Java.use(CLASS);
      let result;
      if (trigger === 'java') result = fixture.invokeTarget('probe');
      else if (trigger === 'bridge') result = fixture.target('probe');
      else {
        const StringClass = Java.use('java.lang.String');
        const reflected = fixture.class.getDeclaredMethod('target', Java.array('java.lang.Class', [StringClass.class]));
        result = reflected.invoke(null, Java.array('java.lang.Object', [StringClass.$new('probe')]));
      }
      return {result: String(result), originalCalls: Number(fixture.getCalls()) - baselineCalls};
    });
    const reproduced = maxDepth > 1 && observed.originalCalls === 0 && observed.result === GUARD_RESULT;
    const normal = entries === 1 && maxDepth === 1 && observed.originalCalls === 1 && observed.result === 'original:probe';
    return {
      status: reproduced ? 'reproduced' : normal ? 'normal' : 'inconclusive',
      pid: Process.id, androidVersion: Java.androidVersion, fridaVersion: Frida.version,
      preparation, trigger, entrypoint, entries, maxDepth, events, ...observed,
    };
  } finally {
    if (installed) Java.performNow(() => { method.implementation = null; });
  }
}
