let used = false;
export const verifyStaticHookFix = (options = {}) => new Promise((resolve, reject) => Java.perform(() => {
  if (used) return reject(Error('Fresh process required'));
  used = true;
  const work = async () => {
    const C = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.StaticHookMatrixFixture');
    const recursive = options.key === 'recursive';
    const index = recursive ? 7 : options.key === 'fail' ? 8 : 0;
    const key = options.key || 'integer';
    const baseline = Number(C.calls(index)); // Deliberately induce the failing preparation.
    const args = recursive ? [2] : key === 'fail' ? [] : [5];
    const types = key === 'fail' ? [] : ['int'];
    const method = C[key].overload(...types);
    let entries = 0, completed = 0, lastValue, errors = 0;
    const seen = [];
    const filter = ({args}) => { entries++; if (seen.length < 12) seen.push(args.map(String)); return options.mode !== 'filter' && !(key === 'fail' && options.api !== 'chain'); };
    const action = () => {
      for (let i = 0; i < 100; i++) {
        try { lastValue = String(options.trigger === 'java' ? C.invoke(index) : method.call(C, ...args)); }
        catch(e) { if (!String(e).includes('STATIC_MATRIX_EXPECTED')) throw e; errors++; }
        completed++;
      }
    };
    if (options.api === 'chain') {
      await Probe.evidence.withChainEvidence(action, 'Static visibility regression', undefined, [{target:C, method:key, argumentTypes:types, filter}]);
    } else {
      await Override.run([{target:C, method:key, argumentTypes:types, filter,
        withReturn: ({receiver,args}) => {
          if (options.mode === 'callback-error') throw Error('Expected callback fallback');
          return method.call(receiver,...args);
        }}], action);
    }
    const originalCalls = Number(C.calls(index)) - baseline;
    const expectedCalls = recursive ? 300 : 100;
    return {pid:Process.id,options,entries,originalCalls,completed,errors,lastValue,seen,
      cleaned:method.implementation === null,
      passed:entries === expectedCalls && originalCalls === expectedCalls && completed === 100 && method.implementation === null
        && (key === 'fail' ? errors === 100 : lastValue === (recursive ? '3' : '12'))};
  };
  const execute = () => work().then(resolve,reject);
  if(options.thread === 'main') Java.scheduleOnMainThread(execute); else execute();
}));
