const CONTROLLER_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController';
const FIXTURE_CLASS = 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState';
const SCENARIO_LABELS = {
  single: 'Single method replacement',
  overload: 'Exact overload replacement',
  filter: 'Invocation argument filter',
  async_cleanup: 'Async scope cleanup',
};

function navigation(scenarioKey) {
  return {
    capabilityMenuId: R.id.api_menu_override,
    capabilityRootId: R.id.api_override_root,
    capabilityName: 'Override',
    scenarioKey,
    scenarioLabel: SCENARIO_LABELS[scenarioKey],
  };
}

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

function fixtureState() {
  let state;
  Java.performNow(() => { state = Java.use(FIXTURE_CLASS).getInstance(); });
  return state;
}

function callCount(state, key) {
  let value;
  Java.performNow(() => { value = Number(state.getOriginalCallCount(key)); });
  return value;
}

/** Replace a single Java method, then prove the original is restored outside scope. */
export async function probeSingleOverride() {
  return withScenarioNavigation(navigation('single'), () => {
  const state = fixtureState();
  let inside;
  Java.performNow(() => {
    inside = Override.run([{
      target: FIXTURE_CLASS,
      method: 'single',
      argumentTypes: ['java.lang.String'],
      withReturn: 'overridden-single',
    }], () => state.single('inside').toString());
  });
  const callsInside = callCount(state, 'single');
  let outside;
  Java.performNow(() => { outside = state.single('outside').toString(); });
  const callsOutside = callCount(state, 'single');
  return {
    passed: inside === 'overridden-single'
      && callsInside === 0
      && outside === 'single:outside'
      && callsOutside === 1,
    api: 'Override.run',
    result: { inside, outside },
    oracle: { callsInside, callsOutside },
  };
  });
}

/** Replace only the int overload and prove the String overload remains original. */
export async function probeExactOverload() {
  return withScenarioNavigation(navigation('overload'), () => {
  const state = fixtureState();
  let intResult;
  let stringResult;
  Java.performNow(() => {
    const method = state.overloaded;
    intResult = Override.run([{
      target: FIXTURE_CLASS,
      method: 'overloaded',
      argumentTypes: ['int'],
      withReturn: 'int-overridden',
    }], () => method.overload('int').call(state, 7).toString());
    stringResult = method.overload('java.lang.String').call(state, 'value').toString();
  });
  const intCalls = callCount(state, 'overloaded(int)');
  const stringCalls = callCount(state, 'overloaded(String)');
  return {
    passed: intResult === 'int-overridden'
      && stringResult === 'string:value'
      && intCalls === 0
      && stringCalls === 1,
    api: 'Override.run(argumentTypes)',
    result: { intResult, stringResult },
    oracle: { intCalls, stringCalls },
  };
  });
}

/** Apply a synchronous argument filter and verify the unmatched call reaches original once. */
export async function probeFilteredOverride() {
  return withScenarioNavigation(navigation('filter'), () => {
  const state = fixtureState();
  let matched;
  let unmatched;
  Java.performNow(() => {
    const results = Override.run([{
      target: FIXTURE_CLASS,
      method: 'featureForScope',
      argumentTypes: ['java.lang.String'],
      filter(invocation) {
        return invocation.args[0]?.toString() === 'enabled-scope';
      },
      withReturn: true,
    }], () => ({
      matched: Boolean(state.featureForScope('enabled-scope')),
      unmatched: Boolean(state.featureForScope('other-scope')),
    }));
    matched = results.matched;
    unmatched = results.unmatched;
  });
  const originalCalls = callCount(state, 'featureForScope');
  return {
    passed: matched === true && unmatched === false && originalCalls === 1,
    api: 'Override.run(filter)',
    result: { matched, unmatched },
    oracle: { originalCalls },
  };
  });
}

/** Keep an override through Promise settlement and verify cleanup afterward. */
export async function probeAsyncCleanup() {
  return withScenarioNavigation(navigation('async_cleanup'), async () => {
    const state = fixtureState();
    const inside = await Override.run([{
      target: FIXTURE_CLASS,
      method: 'single',
      argumentTypes: ['java.lang.String'],
      withReturn: 'async-overridden',
    }], async () => {
      await Promise.resolve();
      let value;
      Java.performNow(() => { value = state.single('inside-async').toString(); });
      return value;
    });
    const callsInside = callCount(state, 'single');
    let outside;
    Java.performNow(() => { outside = state.single('outside-async').toString(); });
    const callsOutside = callCount(state, 'single');
    return {
      passed: inside === 'async-overridden'
        && callsInside === 0
        && outside === 'single:outside-async'
        && callsOutside === 1,
      api: 'Override.run(async action)',
      result: { inside, outside },
      oracle: { callsInside, callsOutside },
    };
  });
}

/** Native fields: scalars, static fields, strings, objects, arrays and asynchronous restoration. */
export async function probeFieldValues() {
  return withScenarioNavigation(navigation('async_cleanup'), async () => {
    const name = 'com.agenteasyuse.mobileeasyuse.apidemo.state.OverrideFieldsFixture';
    let state, definitions, object, numbers, regions;
    Java.performNow(() => {
      state = Java.use(name).$new();
      object = Java.use('java.lang.Object').$new();
      numbers = Java.array('int', [8, 9]);
      regions = Java.array('java.lang.String', ['JP']);
      definitions = [{target: name, field: 'staticEnabled', withValue: true},
        {target: Java.use(name), field: 'staticRegion', withValue: 'JP'},
        ...Object.entries({enabled: true, variant: 3, limit: 4, mode: 3,
          wide: int64('9007199254740993'), ratio: 0.75, threshold: 0.5, marker: 'B',
          region: 'JP', inheritedRegion: 'JP', policy: object, numbers,
          regions, optional: object, _collision: 9,
        }).map(([field, withValue]) => ({target: state, field, withValue}))];
    });
    let inside, appWrite;
    const result = await Override.run(definitions, async () => {
      await Promise.resolve();
      Java.performNow(() => { inside = state.overridden(object, numbers, regions); state.mutate(); appWrite = state.mode.value === 99; });
      return 'done';
    });
    let restored;
    Java.performNow(() => { restored = state.restored(); state.$dispose(); });
    return {passed: inside && appWrite && restored && result === 'done', api: 'Override.run(fields)',
      result, oracle: {inside, appWrite, restored}};
  });
}

/** Field restoration on synchronous/async failures and mixed definition rollback. */
export async function probeFieldFailures() {
  return withScenarioNavigation(navigation('async_cleanup'), async () => {
    let state;
    Java.performNow(() => { state = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.OverrideFieldsFixture').$new(); });
    const defs = [{target: state, field: 'mode', withValue: 3}, {target: state, field: 'region', withValue: 'JP'}];
    const failure = new Error('expected-field-action-error');
    let caught = 0, actionCalls = 0;
    const checkpoints = [];
    const checkpoint = () => { let ok; Java.performNow(() => { ok = state.restored(); }); checkpoints.push(ok); };
    try { Override.run(defs, () => { actionCalls++; throw failure; }); } catch (e) { if (e === failure) caught++; }
    checkpoint();
    try { await Override.run(defs, async () => { actionCalls++; throw failure; }); } catch (e) { if (e === failure) caught++; }
    checkpoint();
    const errors = [];
    for (const [name, extra, expectedMessage] of [
      ['missing-field', {target: state, field: 'missing', withValue: 1}, 'Java field not found: missing'],
      ['missing-value', {target: state, field: 'mode'}, 'field requires field and withValue'],
      ['instance-required', {target: 'com.agenteasyuse.mobileeasyuse.apidemo.state.OverrideFieldsFixture', field: 'mode', withValue: 1}, 'Cannot access an instance field without an instance'],
      ['invalid-boolean', {target: state, field: 'enabled', withValue: 'not-a-boolean'}, 'Expected value compatible with boolean'],
      ['mixed-options', {target: state, field: 'mode', withValue: 1, withReturn: 2}, 'without method options'],
    ]) {
      let message = '';
      try { Override.run([...defs, extra], () => { actionCalls++; }); }
      catch (error) { message = String(error.message); }
      const passed = message.includes(expectedMessage);
      if (passed) caught++;
      errors.push({name, passed, message});
      checkpoint();
    }
    let restored, mixed;
    Java.performNow(() => {
      mixed = Override.run([{target: state, method: 'collision', withReturn: 99}, ...defs],
        () => state.collision() === 99 && state.mode.value === 3);
      restored = state.restored() && state.collision() === 1;
      state.$dispose();
    });
    return {passed: caught === 7 && actionCalls === 2 && restored && mixed && checkpoints.every(Boolean),
      api: 'Override.run(field failures)', result: {caught, actionCalls, errors}, oracle: {restored, mixed, checkpoints}};
  });
}


/** Successful replacement factories and callback fallback, checked against native call counts. */
export async function probeMethodCallbacks() {
  return withScenarioNavigation(navigation('async_cleanup'), async () => {
    const state = fixtureState();
    const invoke = value => { let result; Java.performNow(() => { result = String(state.single(value)); }); return result; };
    const replacement = 'mock';
    const cases = [
      {name: 'null-result', options: {withReturn: null}, expected: 'null', calls: 0},
      {name: 'factory', options: {withReturn(invocation) {
        if (String(invocation.args[0]) !== 'inside') throw new Error('wrong argument');
        if (invocation.receiver.$className !== FIXTURE_CLASS) throw new Error('wrong receiver');
        return replacement;
      }}, expected: 'mock', calls: 0},
      {name: 'filter-false', options: {filter: () => false, withReturn: replacement}, expected: 'single:inside', calls: 1},
      {name: 'filter-nonboolean', options: {filter: () => 1, withReturn: replacement}, expected: 'single:inside', calls: 1},
      {name: 'filter-throws', options: {filter() {throw new Error('expected filter error');}, withReturn: replacement}, expected: 'single:inside', calls: 1},
      {name: 'factory-throws', options: {withReturn() {throw new Error('expected factory error');}}, expected: 'single:inside', calls: 1},
    ];
    const checks = [];
    for (const scenario of cases) {
      const before = callCount(state, 'single');
      const inside = Override.run([{target: FIXTURE_CLASS, method: 'single', argumentTypes: ['java.lang.String'], ...scenario.options}], () => invoke('inside'));
      const calls = callCount(state, 'single') - before;
      const outside = invoke('outside');
      checks.push({name: scenario.name, passed: inside === scenario.expected && calls === scenario.calls
        && outside === 'single:outside' && callCount(state, 'single') === before + calls + 1, inside, calls, outside});
    }
    return {passed: checks.every(x => x.passed), api: 'Override.run(callbacks)', result: checks, oracle: {cases: checks.length}};
  });
}

/** Method restoration after action failures and rejected installation, verified after every case. */
export async function probeMethodFailures() {
  return withScenarioNavigation(navigation('async_cleanup'), async () => {
    const state = fixtureState();
    const invoke = value => { let result; Java.performNow(() => { result = String(state.single(value)); }); return result; };
    const definition = {target: FIXTURE_CLASS, method: 'single', argumentTypes: ['java.lang.String'], withReturn: 'mock'};
    const expected = new Error('expected action error');
    const checks = [];
    for (const asynchronous of [false, true]) {
      let caught = false, inside;
      try {
        await Override.run([definition], asynchronous
          ? async () => { inside = invoke('inside'); await Promise.resolve(); throw expected; }
          : () => { inside = invoke('inside'); throw expected; });
      } catch (error) { caught = error === expected; }
      checks.push({name: asynchronous ? 'rejection' : 'throw', passed: caught && inside === 'mock' && invoke('outside') === 'single:outside'});
    }
    const invalid = [
      ['missing-class', {...definition, target: 'MissingOverrideFixture'}, 'ClassNotFoundException'],
      ['missing-method', {...definition, method: 'missing'}, 'Java method not found'],
      ['missing-return', {target: FIXTURE_CLASS, method: 'single', argumentTypes: ['java.lang.String']}, 'withReturn is required'],
      ['invalid-filter', {...definition, filter: true}, 'filter must be a function'],
    ];
    for (const [name, invalidDefinition, expectedMessage] of invalid) {
      let message = '', called = false;
      try { Override.run([invalidDefinition], () => { called = true; }); }
      catch (error) { message = String(error.message); }
      checks.push({name, message, passed: message.includes(expectedMessage) && !called && invoke('outside') === 'single:outside'});
    }
    let rollbackMessage = '', rollbackAction = false;
    try { Override.run([definition, invalid[1][1]], () => { rollbackAction = true; }); }
    catch (error) { rollbackMessage = String(error.message); }
    checks.push({name: 'partial-install-rollback', message: rollbackMessage,
      passed: rollbackMessage.includes(invalid[1][2]) && !rollbackAction && invoke('outside') === 'single:outside'});
    let empty = false, badAction = false;
    try { Override.run([], () => {}); } catch (error) { empty = /non-empty/.test(error.message); }
    try { Override.run([definition], null); } catch (error) { badAction = /action must be a function/.test(error.message); }
    checks.push({name: 'run-validation', passed: empty && badAction && invoke('outside') === 'single:outside'});
    return {passed: checks.every(x => x.passed), api: 'Override.run(method failures)', result: checks, oracle: {cases: checks.length}};
  });
}

/** All-overload selection, ambiguous-signature rejection and throwing-original fallback. */
export async function probeMethodSelection() {
  return withScenarioNavigation(navigation('overload'), () => {
    const state = fixtureState();
    const checks = [];
    Java.performNow(() => {
      const signatures = [['int'], ['java.lang.String'], ['java.lang.String', 'int']];
      const argumentsByCase = [[7], ['x'], ['x', 2]];
      const methods = signatures.map(types => state.overloaded.overload(...types));
      const counts = () => ['overloaded(int)', 'overloaded(String)', 'overloaded(String,int)'].map(key => callCount(state, key));
      const before = counts();
      const inside = Override.run([{target: FIXTURE_CLASS, method: 'overloaded', allOverloads: true,
        withReturn: invocation => `mock:${invocation.argumentTypes.join(',')}`}],
      () => methods.map((method, i) => String(method.call(state, ...argumentsByCase[i]))));
      checks.push({name: 'all-overloads', passed: inside.every((value, i) => value === `mock:${signatures[i].join(',')}`)
        && counts().every((value, i) => value === before[i])});
      const outside = methods.map((method, i) => String(method.call(state, ...argumentsByCase[i])));
      checks.push({name: 'restored', passed: JSON.stringify(outside) === JSON.stringify(['int:7', 'string:x', 'x:2'])});
      for (const [name, options, expectedMessage] of [
        ['ambiguous', {}, 'specify argumentTypes or allOverloads'],
        ['missing-signature', {argumentTypes: ['boolean']}, 'specified argument types do not match'],
        ['conflicting-selection', {argumentTypes: ['int'], allOverloads: true}, 'cannot use argumentTypes and allOverloads together'],
      ]) {
        let rejected = false, called = false, message = '';
        try { Override.run([{target: FIXTURE_CLASS, method: 'overloaded', withReturn: 'bad', ...options}], () => { called = true; }); }
        catch (error) { message = String(error.message); rejected = message.includes(expectedMessage); }
        checks.push({name, message, passed: rejected && !called && String(methods[0].call(state, 7)) === 'int:7'});
      }
      const conflict = Override.run([{target: FIXTURE_CLASS, method: 'overloaded',
        argumentTypes: ['java.lang.String'], withReturn: 'outer'}], () => {
        let rejected = false, called = false;
        try { Override.run([{target: FIXTURE_CLASS, method: 'overloaded', allOverloads: true, withReturn: 'inner'}], () => { called = true; }); }
        catch (error) { rejected = String(error).includes('already has an implementation'); }
        return rejected && !called && String(methods[0].call(state, 7)) === 'int:7'
          && String(methods[1].call(state, 'x')) === 'outer';
      });
      checks.push({name: 'partial-overload-conflict', passed: conflict && String(methods[1].call(state, 'x')) === 'string:x'});
      for (const options of [{filter: () => false, withReturn: 'unused'},
        {filter() {throw new Error('expected');}, withReturn: 'unused'},
        {withReturn() {throw new Error('expected');}}]) {
        const count = callCount(state, 'throwFromFixture');
        let propagated = false;
        try { Override.run([{target: FIXTURE_CLASS, method: 'throwFromFixture', ...options}], () => state.throwFromFixture()); }
        catch (error) { propagated = String(error).includes('API_DEMO_FIXTURE_THROW'); }
        checks.push({name: `throwing-original-${checks.length}`, passed: propagated && callCount(state, 'throwFromFixture') === count + 1});
      }
    });
    return {passed: checks.every(x => x.passed), api: 'Override.run(selection)', result: checks, oracle: {cases: checks.length}};
  });
}

/** Null references and per-instance field scope, including static restoration between scopes. */
export async function probeFieldIsolation() {
  return withScenarioNavigation(navigation('async_cleanup'), () => {
    let result;
    Java.performNow(() => {
      const Class = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.OverrideFieldsFixture');
      const target = Class.$new(), other = Class.$new();
      try {
        const fields = ['region', 'policy', 'numbers', 'regions'];
        const checks = [];
        for (let repeat = 0; repeat < 2; repeat++) {
          const inside = Override.run([...fields.map(field => ({target, field, withValue: null})),
            {target, field: 'mode', withValue: 8}, {target: Class, field: 'staticRegion', withValue: null}], () =>
            fields.every(field => target[field].value === null) && target.mode.value === 8
            && other.mode.value === 2 && other.region.value === 'original-region' && Class.staticRegion.value === null);
          checks.push({name: `scope-${repeat}`, passed: inside && target.restored() && other.restored()});
        }
        result = {passed: checks.every(x => x.passed), api: 'Override.run(field isolation)', result: checks, oracle: {cases: checks.length}};
      } finally { target.$dispose(); other.$dispose(); }
    });
    return result;
  });
}
