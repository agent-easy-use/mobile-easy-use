const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const FIXTURE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState';
const NAVIGATION = {
  capabilityMenuId: R.id.api_menu_evidence,
  capabilityRootId: R.id.api_evidence_root,
  capabilityName: 'Evidence',
  scenarioKey: 'chain',
  scenarioLabel: 'Java method and log chain',
};

async function revealCapabilityItem(resourceId) {
  let ready = await AndroidExp.wait.ui(resourceId, 'visible', { timeoutMs: 300, intervalMs: 50 });
  for (let attempt = 0; !ready.ok && attempt < 4; attempt += 1) {
    const scrolled = await AndroidExp.input.scroll(R.id.api_main_list, 'up');
    if (!scrolled.ok) return ready;
    ready = await AndroidExp.wait.ui(resourceId, 'visible', { timeoutMs: 500, intervalMs: 50 });
  }
  return ready;
}

async function withScenarioNavigation(config, action) {
  const failure = (step, result) => ({
    passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: config,
  });
  const returnToMain = async () => {
    try {
      Java.performNow(() => Java.use(CONTROLLER_CLASS).returnToMain());
    } catch (error) {
      return failure('return-to-main', { message: error.message ?? String(error) });
    }
    const result = await AndroidExp.wait.ui(R.id.api_main_root, 'visible');
    return result.ok ? { passed: true } : failure('wait-main-after-return', result);
  };
  const main = await revealCapabilityItem(config.capabilityMenuId);
  if (!main.ok) return failure('wait-main-menu', main);
  const opened = await AndroidExp.input.click(config.capabilityMenuId);
  if (!opened.ok) return failure('click-capability', opened);
  const catalog = await AndroidExp.wait.ui(config.capabilityRootId, 'visible');
  if (!catalog.ok) {
    await returnToMain();
    return failure('wait-capability-catalog', catalog);
  }
  const scenarioView = AndroidExp.ui.find([`text::${config.scenarioLabel}`]);
  if (scenarioView === null) {
    await returnToMain();
    return failure('find-scenario-item', { found: false });
  }
  await new Promise((resolveReveal, rejectReveal) => Java.scheduleOnMainThread(() => {
    try {
      const rectangle = Java.use('android.graphics.Rect').$new();
      scenarioView.getDrawingRect(rectangle);
      scenarioView.requestRectangleOnScreen(rectangle, true);
      resolveReveal();
    } catch (error) { rejectReveal(error); }
  }));
  const selected = await AndroidExp.input.click(scenarioView);
  if (!selected.ok) {
    await returnToMain();
    return failure('click-scenario', selected);
  }
  const scenario = await AndroidExp.wait.until(() => {
    let matched = false;
    Java.performNow(() => {
      const controller = Java.use(CONTROLLER_CLASS);
      matched = controller.getActivity().toString() === config.capabilityName
        && controller.getScenario().toString() === config.scenarioKey;
    });
    return matched;
  });
  if (!scenario.ok) {
    await returnToMain();
    return failure('wait-scenario', scenario);
  }
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError !== undefined) throw actionError;
  if (!returned.passed) return returned;
  return { ...result, navigation: { returnedToMain: true } };
}

function originalCallCount(key) {
  let value;
  Java.performNow(() => {
    value = Number(Java.use(FIXTURE_CLASS).getInstance().getOriginalCallCount(key));
  });
  return value;
}

/** Capture two selected native log TAGs while excluding an emitted noise TAG. */
export async function probeMethodAndLogChain() {
  return withScenarioNavigation(NAVIGATION, async () => {
    const actionResult = await Probe.evidence.withChainEvidence(
      async () => {
        await Promise.resolve();
        let value;
        Java.performNow(() => {
          const state = Java.use(FIXTURE_CLASS).getInstance();
          value = state.single('chain').toString();
          state.emitDebugLog();
          state.emitOtherTagLog();
          state.emitNoiseLog();
        });
        return value;
      },
      'ApiDemo Java method and log chain',
      new Set(['MEU.ApiDemo', 'MEU.ApiDemo.Other']),
      [{
        target: FIXTURE_CLASS,
        method: 'single',
        argumentTypes: ['java.lang.String'],
        capture: {
          args: ({ args }) => ({ value: args[0].toString() }),
          result: ({ result }) => ({ value: result.toString() }),
          timing: true,
          memory: { metrics: ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes'] },
        },
        filter(invocation) {
          return invocation.args[0]?.toString() === 'chain';
        },
      }],
    );
    const originalCalls = originalCallCount('single');
    return {
      passed: actionResult === 'single:chain' && originalCalls === 1,
      api: 'Probe.evidence.withChainEvidence',
      evidenceContract: 'chain-method-log-capture-v3',
      result: { actionResult },
      oracle: { originalCalls },
    };
  });
}


const CAPTURE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture';
const CAPTURE_NAVIGATION = {
  ...NAVIGATION, scenarioKey: 'chain_capture',
  scenarioLabel: 'Method capture: data, time and memory',
};
function fixture(work) {
  let result;
  Java.performNow(() => { result = work(Java.use(CAPTURE_CLASS).getInstance()); });
  return result;
}
function hook(method, capture, extra = {}) {
  return { target: CAPTURE_CLASS, method, ...(capture ? { capture } : {}), ...extra };
}
function resourceCapture() {
  return { timing: true, memory: { metrics: ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes'] } };
}
async function captureScenario(contract, action, hooks, expectedCalls) {
  return withScenarioNavigation(CAPTURE_NAVIGATION, async () => {
    try {
      const result = await Probe.evidence.withChainEvidence(action, contract, undefined, hooks);
      const calls = fixture(state => Number(state.getCalls()));
      return { passed: result.passed === true && calls === expectedCalls,
        api: 'Probe.evidence.withChainEvidence', evidenceContract: contract,
        result, oracle: { calls, expectedCalls } };
    } finally { fixture(state => state.reset()); }
  });
}

/** Allocate a retained buffer and delay 15ms; validate input/output and real metrics in the manifest. */
export async function probeCaptureSuccess() {
  return captureScenario('chain-capture-success-v2', () => {
    const value = fixture(state => state.work('success', 262144, 15).toString());
    const retainedBytes = fixture(state => Number(state.getRetainedBytes()));
    return { passed: value === 'success:262144' && retainedBytes === 262144, value, retainedBytes };
  }, [hook('work', { ...resourceCapture(),
    args: ({args}) => ({key: String(args[0]), bytes: Number(args[1]), delayMs: Number(args[2])}),
    result: ({result}) => ({value: String(result)}),
  })], 1);
}

/** Preserve the Java exception and skip result extraction on the throw path. */
export async function probeCaptureThrow() {
  return captureScenario('chain-capture-throw-v2', () => {
    let error = '';
    try { fixture(state => state.fail('expected')); } catch (failure) { error = String(failure); }
    return { passed: error.includes('CHAIN_CAPTURE_FAILURE:expected'), error };
  }, [hook('fail', { ...resourceCapture(), args: ({args}) => ({key: String(args[0])}),
    result: () => { throw new Error('RESULT_MUST_NOT_RUN'); },
  })], 1);
}

/** Keep only the matching call; a second method without capture preserves legacy event shape. */
export async function probeCaptureFilterAndDisabled() {
  return captureScenario('chain-capture-filter-v2', () => {
    const values = fixture(state => [String(state.work('skip', 0, 0)),
      String(state.work('keep', 0, 0)), String(state.plain('legacy'))]);
    return { passed: values.join('|') === 'skip:0|keep:0|plain:legacy', values };
  }, [hook('work', { args: ({args}) => ({key: String(args[0])}), result: ({result}) => String(result) },
    {filter: ({args}) => String(args[0]) === 'keep'}), hook('plain')], 3);
}

/** Three nested calls must retain their own args/results without a public invocation ID. */
export async function probeCaptureRecursive() {
  return captureScenario('chain-capture-recursive-v2', () => {
    const value = fixture(state => Number(state.recursive(2)));
    return { passed: value === 3, value };
  }, [hook('recursive', { timing: true, args: ({args}) => ({depth: Number(args[0])}),
    result: ({result}) => Number(result) })], 3);
}

/** Failed extractors must not alter business results or suppress timing/memory capture. */
export async function probeCaptureExtractorErrors() {
  return captureScenario('chain-capture-errors-v2', () => {
    const value = fixture(state => String(state.work('errors', 0, 0)));
    return { passed: value === 'errors:0', value };
  }, [hook('work', { ...resourceCapture(), args: () => { throw Error('ARGS_CAPTURE_ERROR'); },
    result: () => { throw Error('RESULT_CAPTURE_ERROR'); } })], 1);
}

/** Invalid later configuration must roll back the earlier hook before any action executes. */
export async function probeCaptureInvalidConfigCleanup() {
  return withScenarioNavigation(CAPTURE_NAVIGATION, async () => {
    let actionRan = false;
    let error = '';
    try {
      await Probe.evidence.withChainEvidence(() => { actionRan = true; }, 'invalid-capture', undefined,
        [hook('plain'), hook('work', {memory: {metrics: ['unsupportedMetric']}})]);
    } catch (failure) { error = String(failure); }
    try {
      const value = await Probe.evidence.withChainEvidence(
        () => fixture(state => String(state.plain('restored'))), 'chain-capture-cleanup-v2', undefined,
        [hook('plain', {result: ({result}) => String(result)})]);
      return { passed: !actionRan && error.includes('Unsupported memory metric')
        && value === 'plain:restored' && fixture(state => Number(state.getCalls())) === 1,
        api: 'Probe.evidence.withChainEvidence', evidenceContract: 'chain-capture-cleanup-v2',
        result: {actionRan, error, value}, oracle: {expectedCalls: 1} };
    } finally { fixture(state => state.reset()); }
  });
}

const captureMetrics = ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes'];
const completeNavigate = action => withScenarioNavigation(CAPTURE_NAVIGATION, action);
const resetCaptureFixture = () => fixture(s => s.reset());
const captureCalls = () => fixture(s => Number(s.getCalls()));
const capturePlain = value => fixture(s => String(s.plain(value)));
const captureString = value => value === null ? null : String(value);
const captureHook = (method, capture, extra = {}) => ({target: CAPTURE_CLASS, method, capture, ...extra});
const startCaptureWorkers = () => fixture(s => s.startWorkers());
const waitCaptureWorkers = () => AndroidExp.wait.until(() => fixture(s => Number(s.getWorkersDone())) === 2, {timeoutMs: 5000, intervalMs: 10});
const captureWorkerPeak = () => fixture(s => Number(s.getWorkersPeak()));
const captureWorkerResults = () => fixture(s => String(s.getWorkerResults()));

/** Native boolean, 64-bit precision, null, void and exact overload selection. */
export async function probeCaptureScalars() {
  return completeScenario('scalars', async run => {
    const scalar = value => value === undefined || value === null ? null : typeof value === 'boolean' ? value : String(value);
    const hooks = ['booleanValue', 'wideValue', 'nullable', 'consume'].map(method => captureHook(method,
      {args: ({args}) => scalar(args[0]), result: ({result}) => scalar(result)}));
    hooks.push(captureHook('overloaded', {args: ({args}) => Number(args[0]), result: ({result}) => String(result)}, {argumentTypes: ['int']}));
    const value = await run(() => fixture(s => {
      const ok = s.exerciseScalars(); s.consume(null);
      return !!ok && String(s.overloaded.overload('int').call(s, 7)) === 'int:7'
        && String(s.overloaded.overload('java.lang.String').call(s, 'skip')) === 'string:skip';
    }), hooks);
    return {passed: value === true && captureCalls() === 6};
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
    const value = await run(() => (() => { let value; Java.performNow(() => { value = String(Java.use(FIXTURE_CLASS).staticValue()); }); return value; })(), [{target: FIXTURE_CLASS, method: 'staticValue', argumentTypes: [], capture}]);
    return {passed: value === 'static-original', value};
  });
}

const contextMaxFrames = 64;
const contextHook = captureHook;
const contextDepth = depth => fixture(state => Number(state.contextDepth(depth)));
const contextMain = async () => {
  fixture(state => state.startContextMain());
  const ready = await AndroidExp.wait.until(() => fixture(state => !!state.isContextMainDone()), {timeoutMs: 5000, intervalMs: 10});
  if (!ready.ok) throw Error('Context main callback did not finish');
  return fixture(state => Number(state.getContextMainResult()));
};

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
