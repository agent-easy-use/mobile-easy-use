import assert from 'node:assert/strict';

/** Host-side oracle shared by ApiDemo tests, never loaded into either app. */
export function verifyCompleteCapture(platform, contract, document) {
  const name = contract.replace(/^chain-complete-/, '').replace(/-v1$/, '');
  const counts = {static: 1, options: 7, 'invalid-values': 7, config: 1, async: 3, 'filter-errors': 1,
    concurrent: 2, scalars: platform === 'ios' ? 6 : 5, success: 1, recursive: 3, errors: 1, abi: 2};
  assert.ok(Object.hasOwn(counts, name), `known complete contract: ${contract}`);
  assert.equal(document.actionDescription, contract);
  assert.deepEqual(document.state, {}); assert.deepEqual(document.ui, {});
  const events = document.chain;
  assert.equal(events.length, counts[name] * 2, 'exact number of method records');
  const starts = events.filter(e => e.phase === 'enter'), ends = events.filter(e => e.phase === 'leave');
  assert.equal(starts.length, counts[name]); assert.equal(ends.length, counts[name]);
  const method = e => platform === 'ios' ? e.selector.replace(/^[-+] /, '').split(':')[0] : e.method;
  const metrics = platform === 'ios' ? ['physicalFootprintBytes'] : ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes'];
  for (const event of events) {
    assert.equal(event.type, 'method');
    assert.equal(event.className, name === 'static' ? (platform === 'ios' ? 'APISDKFixtureState' : 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState') : platform === 'ios' ? 'APIChainCaptureFixture' : 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture');
    assert.ok(!Object.hasOwn(event, 'invocationId'));
    assert.ok(!Object.hasOwn(event.capture ?? {}, 'elapsedNs'));
    for (const field of event.phase === 'enter' ? ['result', 'elapsedMs', 'memory'] : ['args'])
      assert.ok(!Object.hasOwn(event.capture ?? {}, field), `${field} in correct phase`);
    if (event.capture?.captureErrors) {
      for (const error of event.capture.captureErrors) {
        assert.ok(typeof error.message === 'string' && error.message.length > 0);
        assert.equal(error.field, event.phase === 'enter' ? 'args' : 'result');
      }
    }
  }
  const timing = (e, min = 0) => assert.ok(typeof e.capture?.elapsedMs === 'number'
    && Number.isFinite(e.capture.elapsedMs) && e.capture.elapsedMs >= min, 'finite elapsedMs');
  const memory = (e, selected = metrics) => {
    assert.deepEqual(Object.keys(e.capture.memory).sort(), [...selected].sort());
    for (const metric of selected) {
      const v = e.capture.memory[metric];
      assert.equal(v.unit, 'bytes'); assert.ok(Number.isSafeInteger(v.before) && v.before >= 0);
      assert.ok(Number.isSafeInteger(v.after) && v.after >= 0); assert.equal(v.delta, v.after - v.before);
    }
  };
  const expectCaptureErrors = ['invalid-values', 'errors', 'abi'].includes(name);
  if (!expectCaptureErrors) for (const e of events) assert.equal(e.capture?.captureErrors, undefined, 'no unexpected capture errors');
  if (!['recursive', 'concurrent'].includes(name)) {
    assert.equal(events.map(e => e.phase).join(','), Array(counts[name]).fill('enter,leave').join(','));
    starts.forEach((e, i) => assert.equal(method(e), method(ends[i])));
  }
  if (name === 'static') {
    assert.equal(method(starts[0]), 'staticValue');
    if (platform === 'ios') assert.ok(events.every(e => e.selector === '+ staticValue'));
    assert.deepEqual(starts[0].capture.args, {count: 0});
    assert.equal(ends[0].capture.result, 'static-original'); timing(ends[0]);
  } else if (name === 'options') {
    assert.ok(events.every(e => method(e) === 'plain'));
    for (let i = 0; i < 3; i++) { assert.equal(starts[i].capture, undefined); assert.deepEqual(ends[i].capture, i === 0 ? undefined : {}); }
    assert.deepEqual(starts[3].capture, {args: {nested: [false, null, 0, '']}}); assert.deepEqual(ends[3].capture, {});
    assert.equal(starts[4].capture, undefined); assert.deepEqual(ends[4].capture, {result: false});
    assert.equal(starts[5].capture, undefined); timing(ends[5]); assert.deepEqual(Object.keys(ends[5].capture), ['elapsedMs']);
    assert.equal(starts[6].capture, undefined); memory(ends[6], [metrics[0]]); assert.deepEqual(Object.keys(ends[6].capture), ['memory']);
  } else if (['invalid-values', 'errors', 'abi'].includes(name)) {
    starts.forEach(e => { assert.equal(e.capture.captureErrors.length, 1); assert.ok(!Object.hasOwn(e.capture, 'args')); });
    ends.forEach(e => { assert.equal(e.capture.captureErrors.length, 1); assert.ok(!Object.hasOwn(e.capture, 'result')); timing(e); });
    if (name === 'errors') { memory(ends[0]); assert.match(starts[0].capture.captureErrors[0].message, /ARGS_CAPTURE_ERROR/); assert.match(ends[0].capture.captureErrors[0].message, /RESULT_CAPTURE_ERROR/); }
    if (name === 'abi') { assert.deepEqual(starts.map(method), ['floating', 'rangeValue']); ends.forEach(e => assert.match(e.capture.captureErrors[0].message, /Unsupported capture ABI/)); }
  } else if (name === 'config' || name === 'filter-errors') {
    assert.equal(method(starts[0]), 'plain'); assert.equal(starts[0].capture, undefined);
    assert.deepEqual(ends[0].capture, {result: name === 'config' ? 'plain:restored' : 'plain:keep'});
  } else if (name === 'async') {
    assert.deepEqual(starts.map(e => e.capture), ['resolve', 'reject', 'restored'].map(args => ({args})));
    assert.deepEqual(ends.map(e => e.capture), ['resolve', 'reject', 'restored'].map(v => ({result: 'plain:' + v})));
  } else if (name === 'concurrent') {
    assert.deepEqual(events.slice(0, 2).map(e => e.phase), ['enter', 'enter'], 'native overlap');
    assert.ok(events.every(e => method(e) === 'worker'));
    assert.deepEqual(starts.map(e => e.capture.args.id).sort(), [1, 2]);
    assert.deepEqual(ends.map(e => e.capture.result).sort((a,b) => a.id-b.id), [{id: 1, value: 10}, {id: 2, value: 20}]);
    ends.forEach(e => { timing(e, 45); memory(e); });
  } else if (name === 'recursive') {
    assert.ok(events.every(e => method(e) === 'recursive'));
    assert.equal(events.map(e => e.phase).join(','), 'enter,enter,enter,leave,leave,leave');
    assert.deepEqual(starts.map(e => e.capture.args.depth), [2, 1, 0]);
    assert.deepEqual(ends.map(e => e.capture.result), [1, 2, 3]);
    ends.forEach(e => timing(e)); assert.ok(ends[2].capture.elapsedMs >= ends[1].capture.elapsedMs && ends[1].capture.elapsedMs >= ends[0].capture.elapsedMs);
  } else if (name === 'success') {
    assert.equal(method(starts[0]), 'work'); assert.deepEqual(starts[0].capture.args, {key: 'success', bytes: 262144, delayMs: 15});
    assert.equal(ends[0].capture.result, 'success:262144'); timing(ends[0], 15); memory(ends[0]);
  } else if (name === 'scalars') {
    const expected = platform === 'ios' ? [
      ['consume', null, null], ['booleanValue', false, false], ['byteValue', -7, -7],
      ['signedValue', '-9223372036854775808', '-9223372036854775808'],
      ['unsignedValue', '18446744073709551615', '18446744073709551615'], ['nullable', null, null],
    ] : [['booleanValue', false, false], ['wideValue', '-9223372036854775808', '-9223372036854775808'],
      ['nullable', null, null], ['consume', null, null], ['overloaded', 7, 'int:7']];
    assert.deepEqual(starts.map((e,i) => [method(e), e.capture.args, ends[i].capture.result]), expected);
  }
  return {contract, methodRecords: events.length, cases: counts[name]};
}
