const CONTROLLER_CLASS = 'APIController';
const FIXTURE_CLASS = 'APISDKFixtureState';

function onMain(work) {
  return new Promise((resolve, reject) => ObjC.schedule(ObjC.mainQueue, () => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
}

async function returnToMain() {
  await onMain(() => ObjC.classes[CONTROLLER_CLASS].returnToMain());
  return IOS.wait.ui('api.menu.probe', 'visible');
}

async function navigate(action) {
  const fail = (step, result) => ({ passed: false, api: 'ApiDemo.navigation', result: { step, result }, oracle: { category: 'probe', scenario: 'method_log' } });
  const main = await IOS.wait.ui('api.menu.probe', 'visible');
  if (!main.ok) return fail('wait-main', main);
  const opened = await IOS.input.click('api.menu.probe');
  if (!opened.ok) return fail('open-category', opened);
  const catalog = await IOS.wait.ui('api.probe.root', 'visible');
  if (!catalog.ok) return fail('wait-catalog', catalog);
  const selected = await IOS.input.click('api.probe.scenario.method_log');
  if (!selected.ok) return fail('select-scenario', selected);
  const ready = await IOS.wait.ui('api.probe.ready.method_log', 'visible');
  if (!ready.ok) return fail('wait-scenario', ready);
  let result;
  let actionError;
  try { result = await action(); } catch (error) { actionError = error; }
  const returned = await returnToMain();
  if (actionError) throw actionError;
  if (!returned.ok) return fail('return-main', returned);
  return { ...result, navigation: { returnedToMain: true } };
}

function callCount(state, selector) {
  return Number(state.originalCallCount_(selector));
}

/** Replace an Objective-C instance method and prove the original IMP is restored. */
export async function probeInstanceOverride() {
  return navigate(() => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const replacement = ObjC.classes.NSString.stringWithString_('overridden-single');
    const inside = Override.run([{
      target: FIXTURE_CLASS,
      selector: '- single:',
      withReturn: replacement,
    }], () => String(state.single_('inside')));
    const callsInside = callCount(state, 'single:');
    const outside = String(state.single_('outside'));
    const callsOutside = callCount(state, 'single:');
    return {
      passed: inside === 'overridden-single' && callsInside === 0 && outside === 'single:outside' && callsOutside === 1,
      api: 'Override.run(instance)',
      result: { inside, outside },
      oracle: { callsInside, callsOutside },
    };
  });
}

/** Replace an Objective-C class method and prove class-selector restoration. */
export async function probeClassOverride() {
  return navigate(() => {
    const replacement = ObjC.classes.NSString.stringWithString_('static-overridden');
    const inside = Override.run([{
      target: FIXTURE_CLASS,
      selector: '+ staticValue',
      withReturn: replacement,
    }], () => String(ObjC.classes[FIXTURE_CLASS].staticValue()));
    const outside = String(ObjC.classes[FIXTURE_CLASS].staticValue());
    return {
      passed: inside === 'static-overridden' && outside === 'static-original',
      api: 'Override.run(class)',
      result: { inside, outside },
      oracle: { restored: true },
    };
  });
}

/** Apply an argument filter and allow an unmatched call through exactly once. */
export async function probeFilteredOverride() {
  return navigate(() => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const observedArguments = [];
    const result = Override.run([{
      target: FIXTURE_CLASS,
      selector: '- featureForScope:',
      filter(invocation) {
        const value = String(new ObjC.Object(invocation.args[0]));
        observedArguments.push(value);
        return value === 'enabled-scope';
      },
      withReturn: true,
    }], () => ({
      matched: Boolean(state.featureForScope_('enabled-scope')),
      unmatched: Boolean(state.featureForScope_('other-scope')),
    }));
    const originalCalls = callCount(state, 'featureForScope:');
    return {
      passed: result.matched === true && result.unmatched === false && originalCalls === 1,
      api: 'Override.run(filter)',
      result: { ...result, observedArguments },
      oracle: { originalCalls },
    };
  });
}

/** Keep an override installed through Promise settlement and clean it afterward. */
export async function probeAsyncCleanup() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const replacement = ObjC.classes.NSString.stringWithString_('async-overridden');
    const inside = await Override.run([{
      target: FIXTURE_CLASS,
      selector: '- single:',
      withReturn: replacement,
    }], async () => {
      await Promise.resolve();
      return String(state.single_('inside-async'));
    });
    const callsInside = callCount(state, 'single:');
    const outside = String(state.single_('outside-async'));
    const callsOutside = callCount(state, 'single:');
    return {
      passed: inside === 'async-overridden' && callsInside === 0 && outside === 'single:outside-async' && callsOutside === 1,
      api: 'Override.run(async)',
      result: { inside, outside },
      oracle: { callsInside, callsOutside },
    };
  });
}

async function withFields(action) {
  return navigate(async () => {
    const state = ObjC.classes.APIOverrideFieldsFixture.alloc().init();
    try { return await action(state); } finally { state.release(); }
  });
}

/** Scalar and object ivars, including inherited storage and reference identity restoration. */
export async function probeFieldValues() {
  return withFields(async state => {
    const mock = state.makeMock();
    mock.release(); // The fixture owns it until action drops that ownership.
    const text = ObjC.classes.NSString.stringWithString_('JP');
    const items = ObjC.classes.NSArray.arrayWithObject_(text);
    const definitions = Object.entries({_enabled: true, _mode: 3,
      _wide: int64('9007199254740993'), _ratio: 0.75, _region: text,
      _items: items, _policy: mock, _optional: mock, _inheritedText: text,
    }).map(([field, withValue]) => ({target: state, field, withValue}));
    let inside, appWrite, held;
    const result = await Override.run(definitions, async () => {
      await Promise.resolve();
      inside = !!state.scalarsOverridden() && String(state.region()) === 'JP'
        && state.$ivars._policy.handle.equals(mock.handle) && state.$ivars._optional.handle.equals(mock.handle)
        && state.items().handle.equals(items.handle) && Number(state.items().count()) === 1
        && String(state.items().objectAtIndex_(0)) === 'JP'
        && String(state.inheritedText()) === 'JP';
      state.dropMockOwner(); state.setPolicy_(null); state.setOptional_(null); state.setMode_(99);
      appWrite = Number(state.mode()) === 99;
      held = !!state.mockAlive();
      return 'done';
    });
    const restored = !!state.scalarsRestored() && !!state.objectsRestored();
    const released = !state.mockAlive();
    const nullable = Override.run([{target: state, field: '_policy', withValue: null}], () => state.policy() === null);
    return {passed: inside && appWrite && held && restored && released && nullable && !!state.objectsRestored(),
      api: 'Override.run(fields)', result, oracle: {inside, appWrite, held, restored, released, nullable}};
  });
}

/** Native object lifetime and restoration across an asynchronous field scope. */
export async function probeFieldObjectLifetime() {
  return withFields(async state => {
    const mock = state.makeMock();
    mock.release(); // The fixture owns it until action drops that ownership.
    let held, expired;
    await Override.run([{target: state, field: '_weakPolicy', withValue: mock}], async () => {
      state.dropMockOwner(); state.dropOriginalOwner();
      await Promise.resolve();
      held = !!state.mockAlive() && !!state.weakHasMock(); expired = !state.originalAlive();
    });
    const cleared = state.weakPolicy() === null && !state.mockAlive();
    return {passed: held && expired && cleared, api: 'Override.run(object lifetime)',
      result: {held, expired}, oracle: {cleared}};
  });
}

/** Restoration and cleanup on errors, unsupported ivars and mixed method/field definitions. */
export async function probeFieldFailures() {
  return withFields(async state => {
    const mock = state.makeMock();
    mock.release(); // The fixture owns it until action drops that ownership.
    const defs = [{target: state, field: '_weakPolicy', withValue: mock},
      {target: state, field: '_policy', withValue: mock}];
    const failure = new Error('expected-field-action-error');
    let caught = 0, actionCalls = 0;
    const checkpoints = [];
    const checkpoint = () => { checkpoints.push(!!state.scalarsRestored() && !!state.objectsRestored() && !!state.weakHasOriginal()); };
    try { Override.run(defs, () => { actionCalls++; throw failure; }); } catch (e) { if (e === failure) caught++; }
    checkpoint();
    try { await Override.run(defs, async () => { actionCalls++; throw failure; }); } catch (e) { if (e === failure) caught++; }
    checkpoint();
    const errors = [];
    for (const [name, extra, expectedMessage] of [
      ['missing-field', {target: state, field: '_missing', withValue: 1}, 'Objective-C ivar not found: _missing'],
      ['missing-value', {target: state, field: '_mode'}, 'field requires an instance, field and withValue'],
      ['instance-required', {target: ObjC.classes.APIOverrideFieldsFixture, field: '_mode', withValue: 1}, 'field requires an instance'],
      ['unsafe-object', {target: state, field: '_unsafePolicy', withValue: mock}, 'object ivar ownership is unsupported'],
      ['struct', {target: state, field: '_range', withValue: 1}, 'ivar type is unsupported'],
      ['block', {target: state, field: '_callback', withValue: mock}, 'ivar type is unsupported'],
      ['invalid-object', {target: state, field: '_policy', withValue: 'not-an-NSString'}, 'object ivar requires an Objective-C object or null'],
      ['mixed-options', {target: state, field: '_mode', withValue: 1, selector: '- mode'}, 'without method options'],
    ]) {
      let message = '';
      try { Override.run([...defs, extra], () => { actionCalls++; }); }
      catch (error) { message = String(error.message); }
      const passed = message.includes(expectedMessage);
      if (passed) caught++;
      errors.push({name, passed, message});
      checkpoint();
    }
    const mixed = Override.run([{target: 'APIOverrideFieldsFixture', selector: '- mode', withReturn: 99},
      {target: state, field: '_enabled', withValue: true}], () => Number(state.mode()) === 99 && !!state.enabled());
    const restored = !!state.scalarsRestored() && !!state.objectsRestored()
      && !!state.weakHasOriginal() && !!state.originalAlive();
    state.dropOriginalOwner();
    const cleared = state.weakPolicy() === null;
    state.dropMockOwner();
    const released = !state.mockAlive();
    return {passed: caught === 10 && actionCalls === 2 && mixed && restored && cleared && released && checkpoints.every(Boolean),
      api: 'Override.run(field failures)', result: {caught, actionCalls, errors}, oracle: {mixed, restored, cleared, released, checkpoints}};
  });
}


/** Successful replacement factories and callback fallback, checked against native call counts. */
export async function probeMethodCallbacks() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const invoke = value => String(state.single_(value));
    const replacement = ObjC.classes.NSString.stringWithString_('mock');
    const cases = [
      {name: 'null-result', options: {withReturn: ptr(0)}, expected: 'null', calls: 0},
      {name: 'factory', options: {withReturn(invocation) {
        if (String(new ObjC.Object(invocation.args[0])) !== 'inside') throw new Error('wrong argument');
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
      const before = callCount(state, 'single:');
      const inside = Override.run([{target: FIXTURE_CLASS, selector: '- single:', ...scenario.options}], () => invoke('inside'));
      const calls = callCount(state, 'single:') - before;
      const outside = invoke('outside');
      checks.push({name: scenario.name, passed: inside === scenario.expected && calls === scenario.calls
        && outside === 'single:outside' && callCount(state, 'single:') === before + calls + 1, inside, calls, outside});
    }
    return {passed: checks.every(x => x.passed), api: 'Override.run(callbacks)', result: checks, oracle: {cases: checks.length}};
  });
}

/** Method restoration after action failures and rejected installation, verified after every case. */
export async function probeMethodFailures() {
  return navigate(async () => {
    const state = ObjC.classes[FIXTURE_CLASS].sharedState();
    const invoke = value => String(state.single_(value));
    const definition = {target: FIXTURE_CLASS, selector: '- single:', withReturn: ObjC.classes.NSString.stringWithString_('mock')};
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
      ['missing-class', {...definition, target: 'MissingOverrideFixture'}, 'Objective-C class not found'],
      ['missing-method', {...definition, selector: '- missing'}, 'Objective-C method not found'],
      ['missing-return', {target: FIXTURE_CLASS, selector: '- single:'}, 'withReturn is required'],
      ['invalid-filter', {...definition, filter: true}, 'filter must be a function'],
      ['selector-prefix', {...definition, selector: 'single:'}, 'selector must start with'],
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

/** Remaining numeric encodings, NSNumber/NSDictionary and instance isolation. */
export async function probeFieldTypes() {
  return withFields(async state => {
    const other = ObjC.classes.APIOverrideFieldsFixture.alloc().init();
    try {
      const values = {_byteMode: -3, _unsignedByte: 250, _shortMode: -300, _unsignedShort: 60000,
        _intMode: -70000, _unsignedInt: 4000000000, _longMode: -90000, _unsignedLong: 90000,
        _unsignedWide: uint64('18446744073709551615'), _floatRatio: 0.75};
      const inside = await Override.run(Object.entries(values).map(([field, withValue]) => ({target: state, field, withValue})),
        async () => { await Promise.resolve(); return !!state.extraScalarsOverridden() && !!other.extraScalarsRestored(); });
      const restored = !!state.extraScalarsRestored();
      const number = ObjC.classes.NSNumber.numberWithInt_(7);
      const dictionary = ObjC.classes.NSDictionary.dictionaryWithObject_forKey_(number, 'mode');
      const objects = Override.run([{target: state, field: '_policy', withValue: dictionary},
        {target: state, field: '_optional', withValue: number}], () =>
        Number(state.policy().objectForKey_('mode').intValue()) === 7 && Number(state.optional().intValue()) === 7
        && other.optional() === null);
      return {passed: inside && restored && objects && !!state.objectsRestored() && !!other.objectsRestored(),
        api: 'Override.run(field types)', result: {inside, objects}, oracle: {restored}};
    } finally { other.release(); }
  });
}

/** Surviving and initially empty object references, null assignment and scope reuse. */
export async function probeFieldReferenceScopes() {
  return withFields(async state => {
    const checks = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      const mock = state.makeMock(); mock.release();
      const inside = await Override.run([{target: state, field: '_weakPolicy', withValue: mock}], async () => {
        state.dropMockOwner(); await Promise.resolve();
        return !!state.mockAlive() && !!state.originalAlive() && !!state.weakHasMock();
      });
      checks.push({name: `surviving-${repeat}`, passed: inside && !!state.weakHasOriginal() && !state.mockAlive()});
    }
    const empty = Override.run([{target: state, field: '_weakPolicy', withValue: null}], () => !!state.weakEmpty());
    checks.push({name: 'null-replacement', passed: empty && !!state.weakHasOriginal()});
    state.dropOriginalOwner();
    const mock = state.makeMock(); mock.release();
    const inside = Override.run([{target: state, field: '_weakPolicy', withValue: mock}], () => {
      state.dropMockOwner(); return !!state.mockAlive() && !!state.weakHasMock();
    });
    checks.push({name: 'initially-null', passed: inside && !!state.weakEmpty() && !state.mockAlive()});
    return {passed: checks.every(x => x.passed), api: 'Override.run(reference scopes)', result: checks, oracle: {cases: checks.length}};
  });
}
