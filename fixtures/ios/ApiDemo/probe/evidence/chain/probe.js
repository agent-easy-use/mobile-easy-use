const CONTROLLER_CLASS = 'APIController';
const FIXTURE_CLASS = 'APISDKFixtureState';

function onMain(work) { return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => { try { resolve(work()); } catch (error) { reject(error); } })); }

async function navigate(action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'probe', scenario: 'chain_evidence' } });
  const main = await IOS.wait.ui('api.menu.probe', 'visible'); if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe'); if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible'); if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.chain_evidence'); if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.chain_evidence', 'visible'); if (!ready.ok) return fail('wait-scenario', ready);
  let result; let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  const returned = await IOS.wait.ui('api.menu.probe', 'visible');
  if (actionError) throw actionError; if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

/** Capture one exact Objective-C method plus static and dynamic NSLog TAGs without changing behavior. */
export async function probeMethodAndLogChain() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const actionResult = await Probe.evidence.withChainEvidence(
      async () => {
        await Promise.resolve();
        const value = String(state.single_('chain'));
        state.emitPrimaryLog();
        state.emitSecondaryLog();
        state.emitDynamicTagLog();
        return value;
      },
      'ApiDemo iOS method and log chain',
      new Set(['MEU.ApiDemo', 'MEU.ApiDemo.Other']),
      [{
        target: FIXTURE_CLASS, selector: '- single:',
        capture: {
          args: ({ args }) => ({ value: String(new ObjC.Object(args[0])) }),
          result: ({ result }) => ({ value: String(new ObjC.Object(result)) }),
          timing: true,
          memory: { metrics: ['physicalFootprintBytes'] },
        },
      }],
    );
    const originalCalls = Number(state.originalCallCount_('single:'));
    return { passed: actionResult === 'single:chain' && originalCalls === 1, api: 'Probe.evidence.withChainEvidence', evidenceContract: 'chain-method-log-capture-v3', result: { actionResult }, oracle: { originalCalls } };
  });
}

const CAPTURE_CLASS = 'APIChainCaptureFixture';
const captureMetrics = ['physicalFootprintBytes'];
const completeNavigate = navigate;
const captureState = () => ObjC.classes[CAPTURE_CLASS].sharedState();
const resetCaptureFixture = () => captureState().reset();
const captureCalls = () => Number(captureState().calls());
const capturePlain = value => String(captureState().plain_(value));
const captureString = value => value.isNull() ? null : String(new ObjC.Object(value));
const captureWrapper = captureState;
const captureSelectors = {plain: '- plain:', recursive: '- recursive:', worker: '- worker:', work: '- work:bytes:delay:'};
const captureHook = (method, capture, extra = {}) => ({target: CAPTURE_CLASS, selector: captureSelectors[method] ?? '- ' + method + ':', capture, ...extra});
const startCaptureWorkers = () => captureState().startWorkers();
const waitCaptureWorkers = () => IOS.wait.until(() => Number(captureState().workersDone()) === 2, {timeoutMs: 5000, intervalMs: 10});
const captureWorkerPeak = () => Number(captureState().workersPeak());
const captureWorkerResults = () => String(captureState().workerResults());

/** Real allocation/delay, Objective-C pointer decoding and all resource fields. */
export async function probeCaptureSuccess() {
  return completeScenario('success', async run => {
    const value = await run(() => String(captureState().work_bytes_delay_('success', 262144, 15)),
      [captureHook('work', {args: ({args}) => ({key: captureString(args[0]), bytes: args[1], delayMs: args[2]}),
        result: ({result}) => captureString(result), timing: true, memory: {metrics: captureMetrics}})]);
    return {passed: value === 'success:262144' && Number(captureState().retainedBytes()) === 262144 && captureCalls() === 1, value};
  });
}

/** Nested native calls retain their own entry arguments and leave results. */
export async function probeCaptureRecursive() {
  return completeScenario('recursive', async run => {
    const value = await run(() => Number(captureState().recursive_(2)), [captureHook('recursive', {
      args: ({args}) => ({depth: args[0]}), result: ({result}) => result, timing: true})]);
    return {passed: value === 3 && captureCalls() === 3, value};
  });
}

/** Extractor exceptions preserve business behavior and resource capture. */
export async function probeCaptureExtractorErrors() {
  return completeScenario('errors', async run => {
    const value = await run(() => capturePlain('errors'), [captureHook('plain', {
      args: () => { throw Error('ARGS_CAPTURE_ERROR'); }, result: () => { throw Error('RESULT_CAPTURE_ERROR'); },
      timing: true, memory: {metrics: captureMetrics}})]);
    return {passed: value === 'plain:errors' && captureCalls() === 1, value};
  });
}

/** Native BOOL, signed byte, exact 64-bit strings, nil and void decoding. */
export async function probeCaptureScalars() {
  return completeScenario('scalars', async run => {
    const normalize = value => value === undefined ? null : typeof value === 'object' && value.isNull ? (value.isNull() ? null : value.toString()) : value;
    const hooks = ['consume', 'booleanValue', 'byteValue', 'signedValue', 'unsignedValue', 'nullable'].map(method => captureHook(method, {
      args: ({args}) => normalize(args[0]), result: ({result}) => normalize(result)}));
    const value = await run(() => !!captureState().exerciseScalars(), hooks);
    return {passed: value === true && captureCalls() === 6};
  });
}

/** Unsupported floating-point and aggregate ABIs report capture errors without guessing. */
export async function probeCaptureUnsupportedABI() {
  return completeScenario('abi', async run => {
    let extractors = 0;
    const hooks = ['floating', 'rangeValue'].map(method => captureHook(method, {
      args: () => { extractors++; return null; }, result: () => { extractors++; return null; }, timing: true}));
    const value = await run(() => !!captureState().exerciseUnsupported(), hooks);
    return {passed: value === true && extractors === 0 && captureCalls() === 2, extractors};
  });
}


// Each export owns its hooks, fixture reset, and navigation lifecycle.
async function completeScenario(name, work) {
  const contract = 'chain-complete-' + name + '-v1';
  return completeNavigate(async () => {
    resetCaptureFixture();
    try {
      const result = await work((action, hooks) => Probe.evidence.withChainEvidence(action, contract, undefined, hooks));
      return { passed: result.passed === true, api: 'Probe.evidence.withChainEvidence',
        evidenceContract: contract, result, oracle: { calls: captureCalls() } };
    } finally { resetCaptureFixture(); }
  });
}

/** Each independent option, empty/disabled capture, and immutable JSON snapshots. */
export async function probeCaptureOptions() {
  return completeScenario('options', async run => {
    const snapshot = { nested: [false, null, 0, ''] };
    const options = [undefined, {}, {timing: false}, {args: () => snapshot},
      {result: () => false}, {timing: true}, {memory: {metrics: [captureMetrics[0], captureMetrics[0]]}}];
    const values = [];
    for (const capture of options) values.push(await run(() => capturePlain('option'), [captureHook('plain', capture)]));
    snapshot.nested[0] = true;
    return {passed: values.every(v => v === 'plain:option') && captureCalls() === 7, values};
  });
}

/** Reject invalid JSON values independently at enter and leave, preserving business behavior. */
export async function probeCaptureInvalidValues() {
  return completeScenario('invalid-values', async run => {
    const cycle = {}; cycle.self = cycle;
    const values = [undefined, NaN, Infinity, cycle, Promise.resolve(1), () => 1, captureWrapper()];
    const results = [];
    for (const value of values) results.push(await run(() => capturePlain('invalid'),
      [captureHook('plain', {args: () => value, result: () => value, timing: true})]));
    return {passed: results.every(v => v === 'plain:invalid') && captureCalls() === values.length, cases: values.length};
  });
}

/** Invalid configuration must reject before action execution and release earlier hooks. */
export async function probeCaptureConfigMatrix() {
  return completeScenario('config', async run => {
    const invalid = [null, [], {args: 1}, {result: 'bad'}, {timing: 1}, {unknown: true},
      {memory: null}, {memory: {metrics: []}}, {memory: {metrics: ['unsupportedMetric']}}];
    let actions = 0; const errors = [];
    for (const capture of invalid) {
      try { await run(() => { actions++; }, [captureHook('plain'), captureHook('recursive', capture)]); }
      catch (error) { errors.push(String(error)); }
    }
    const value = await run(() => capturePlain('restored'), [captureHook('plain', {result: ({result}) => captureString(result)})]);
    return {passed: actions === 0 && errors.length === invalid.length && value === 'plain:restored'
      && captureCalls() === 1, actions, errors, value};
  });
}

/** Promise resolution/rejection releases hooks; the original action error survives unchanged. */
export async function probeCaptureAsyncCleanup() {
  return completeScenario('async', async run => {
    const hooks = [captureHook('plain', {args: ({args}) => captureString(args[0]), result: ({result}) => captureString(result)})];
    const first = await run(async () => { await Promise.resolve(); return capturePlain('resolve'); }, hooks);
    const original = Error('EXPECTED_ACTION_REJECTION'); let sameError = false;
    try { await run(async () => { await Promise.resolve(); capturePlain('reject'); throw original; }, hooks); }
    catch (error) { sameError = error === original; }
    capturePlain('outside');
    const last = await run(() => capturePlain('restored'), hooks);
    return {passed: first === 'plain:resolve' && sameError && last === 'plain:restored' && captureCalls() === 4, sameError};
  });
}

/** A false/throwing filter must skip extractors and leave native calls unchanged. */
export async function probeCaptureFilterErrors() {
  return completeScenario('filter-errors', async run => {
    let extractions = 0; const values = [];
    for (const filter of [() => false, () => { throw Error('EXPECTED_FILTER_ERROR'); }]) {
      values.push(await run(() => capturePlain('skip'), [captureHook('plain', {
        args: () => { extractions++; return null; }, result: () => { extractions++; return null; }, timing: true,
      }, {filter})]));
    }
    const value = await run(() => capturePlain('keep'), [captureHook('plain', {result: ({result}) => captureString(result)})]);
    return {passed: extractions === 0 && values.every(v => v === 'plain:skip') && value === 'plain:keep'
      && captureCalls() === 3, extractions, value};
  });
}

/** Two native worker threads overlap while keeping their entry/exit capture independent. */
export async function probeCaptureConcurrent() {
  return completeScenario('concurrent', async run => {
    const completed = await run(async () => {
      startCaptureWorkers();
      return waitCaptureWorkers();
    }, [captureHook('worker', {args: ({args}) => ({id: Number(args[0])}),
      result: ({result}) => ({id: Number(result) / 10, value: Number(result)}), timing: true,
      memory: {metrics: captureMetrics}})]);
    return {passed: completed.ok === true && captureWorkerPeak() === 2 && captureCalls() === 2,
      completed, peak: captureWorkerPeak(), values: captureWorkerResults()};
  });
}

/** Class/static method capture has no explicit arguments and preserves the return value. */
export async function probeCaptureStatic() {
  return completeScenario('static', async run => {
    const capture = {args: ({args}) => ({count: args.length}), result: ({result}) => captureString(result), timing: true};
    const value = await run(() => String(ObjC.classes[FIXTURE_CLASS].staticValue()), [{target: FIXTURE_CLASS, selector: '+ staticValue', capture}]);
    return {passed: value === 'static-original', value};
  });
}

const contextMaxFrames = 16;
const contextHook = (method, capture, extra = {}) => ({target: CAPTURE_CLASS,
  selector: method === 'contextLeaf' ? '- contextLeaf' : '- contextDepth:', capture, ...extra});
const contextDepth = depth => Number(captureState().contextDepth_(depth));
const contextMain = () => IOS.runOnMainThread(() => {
  const thread = ObjC.classes.NSThread.currentThread();
  const previous = thread.name();
  const saved = previous === null ? null : String(previous);
  try { thread.setName_('capture-main'); return Number(captureState().contextLeaf()); }
  finally { thread.setName_(saved); }
});

// Thread/stack contracts extend capture without changing the wrapper signature.
async function contextScenario(name, work) {
  const contract = 'chain-context-' + name + '-v1';
  return completeNavigate(async () => {
    resetCaptureFixture();
    try {
      const result = await work((action, hooks = [], logTag) =>
        Probe.evidence.withChainEvidence(action, contract, logTag, hooks));
      return {passed: result.passed === true, api: 'Probe.evidence.withChainEvidence',
        evidenceContract: contract, result, oracle: {calls: captureCalls()}};
    } finally { resetCaptureFixture(); }
  });
}

/** Main-thread methods/logs, log-only capture and two named native workers. */
export async function probeThreadNames() {
  return contextScenario('threads', async run => {
    const first = await run(() => contextMain(), [contextHook('contextLeaf')], 'MEU.Context');
    const second = await run(() => contextMain(), [], 'MEU.Context');
    const completed = await run(async () => { startCaptureWorkers(); return waitCaptureWorkers(); },
      [captureHook('worker', {stack: true, args: ({args}) => ({id: Number(args[0])}), result: ({result}) => Number(result)})], 'MEU.Context');
    return {passed: first === 7 && second === 7 && completed.ok && captureCalls() === 4,
      completed, values: captureWorkerResults()};
  });
}

/** Omitted/false stacks, default five frames, custom bounds, native caller frames and existing capture. */
export async function probeCaptureStackOptions() {
  return contextScenario('stack-options', async run => {
    const values = [];
    for (const stack of [undefined, false, true, {}, {maxFrames: 1}, {maxFrames: 3}, {maxFrames: contextMaxFrames}]) {
      values.push(await run(() => contextDepth(8), [contextHook('contextLeaf', {
        stack, timing: true, args: ({args}) => ({count: args.length}), result: ({result}) => Number(result),
        memory: {metrics: captureMetrics},
      })]));
    }
    return {passed: values.every(value => value === 15) && captureCalls() === 7, values};
  });
}

/** Invalid depth/type rejects before action, rolls back prior hooks and permits reinstallation. */
export async function probeCaptureStackConfig() {
  return contextScenario('stack-config', async run => {
    const invalid = [null, [], 1, 'yes', {maxFrames: null}, {maxFrames: 0}, {maxFrames: -1},
      {maxFrames: 1.5}, {maxFrames: NaN}, {maxFrames: Infinity}, {maxFrames: '5'},
      {maxFrames: contextMaxFrames + 1}, {unknown: true}];
    let actions = 0; const errors = [];
    for (const stack of invalid) {
      try { await run(() => { actions++; }, [captureHook('plain'), contextHook('contextLeaf', {stack})]); }
      catch (error) { errors.push(String(error)); }
    }
    const value = await run(() => contextDepth(8), [contextHook('contextLeaf', {stack: true})]);
    return {passed: actions === 0 && errors.length === invalid.length && value === 15 && captureCalls() === 1,
      actions, errors, value};
  });
}

/** Nested stacks, filtered calls, async rejection cleanup and reinstallation. */
export async function probeCaptureStackLifecycle() {
  return contextScenario('stack-lifecycle', async run => {
    const nested = await run(() => contextDepth(3), [contextHook('contextDepth', {stack: {maxFrames: 3},
      args: ({args}) => Number(args[0]), result: ({result}) => Number(result)})]);
    for (const filter of [() => false, () => { throw Error('EXPECTED_FILTER_ERROR'); }]) {
      await run(() => contextDepth(1), [contextHook('contextLeaf', {stack: true}, {filter})]);
    }
    const error = Error('EXPECTED_STACK_ACTION_REJECTION'); let sameError = false;
    try { await run(async () => { await Promise.resolve(); contextDepth(8); throw error; }, [contextHook('contextLeaf', {stack: true})]); }
    catch (failure) { sameError = error === failure; }
    contextDepth(1); // Must not be captured after cleanup.
    const restored = await run(() => contextDepth(8), [contextHook('contextLeaf', {stack: {maxFrames: 1}})]);
    return {passed: nested === 10 && restored === 15 && sameError && captureCalls() === 6, sameError};
  });
}
