import assert from 'node:assert/strict';

/** Independent host oracle for real-device thread names and entry stacks. */
export function verifyChainContext(platform, contract, document) {
  const name = contract.replace(/^chain-context-/, '').replace(/-v1$/, '');
  assert.equal(document.actionDescription, contract);
  assert.deepEqual(document.state, {}); assert.deepEqual(document.ui, {});
  const events = document.chain;
  const methods = events.filter(e => e.type === 'method');
  const starts = methods.filter(e => e.phase === 'enter');
  const ends = methods.filter(e => e.phase === 'leave');
  const logs = events.filter(e => e.type === 'log');
  const method = e => platform === 'ios' ? e.selector.replace(/^[-+] /, '').split(':')[0] : e.method;
  for (const event of events) {
    assert.ok(Object.hasOwn(event, 'threadName'), 'threadName always present');
    assert.ok(event.threadName === null || typeof event.threadName === 'string' && event.threadName.length > 0);
    assert.equal(event.invocationId, undefined);
    assert.equal(event.capture?.captureErrors, undefined, 'no unexpected capture failure');
    if (event.type === 'method') {
      assert.equal(event.className, platform === 'ios' ? 'APIChainCaptureFixture' : 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture');
      if (event.phase === 'leave') assert.equal(event.capture?.stack, undefined, 'stack only on enter');
    }
  }
  const stack = (event, maxFrames, exact = false) => {
    const value = event.capture?.stack;
    assert.equal(value?.kind, platform === 'ios' ? 'native' : 'java');
    assert.ok(value.frames.length > 0 && value.frames.length <= maxFrames, 'bounded nonempty stack');
    if (exact) assert.equal(value.frames.length, maxFrames, 'deep fixture exercises requested depth');
    for (const frame of value.frames) {
      if (platform === 'android') {
        assert.equal(typeof frame.className, 'string'); assert.equal(typeof frame.methodName, 'string');
        assert.equal(typeof frame.signature, 'string');
      } else {
        assert.match(frame.address, /^0x[0-9a-f]+$/i);
        for (const key of ['moduleName', 'name', 'fileName']) assert.ok(frame[key] === null || typeof frame[key] === 'string');
      }
    }
    return value.frames;
  };
  if (name === 'threads') {
    assert.equal(events.length, 10); assert.equal(methods.length, 6); assert.equal(logs.length, 4);
    const main = events.filter(e => e.threadName === 'capture-main');
    assert.equal(main.length, 4); assert.equal(main.filter(e => e.type === 'log').length, 2);
    assert.ok(main.every(e => e.capture === undefined));
    for (const id of [1, 2]) {
      const worker = events.filter(e => e.threadName === (platform === 'android' ? `capture-w${id}` : `capture-worker-${id}`));
      assert.equal(worker.length, 3);
      assert.deepEqual(worker.map(e => e.type === 'log' ? 'log' : e.phase), ['enter', 'log', 'leave']);
      assert.equal(worker[0].capture.args.id, id); assert.equal(worker[2].capture.result, id * 10);
      stack(worker[0], 5);
      assert.ok(worker[1].message.endsWith('worker:' + id));
    }
    for (const log of logs) { assert.equal(log.tag, 'MEU.Context'); assert.equal(log.level, platform === 'ios' ? 'default' : 'i'); }
  } else {
    assert.equal(logs.length, 0);
    const counts = {'stack-options': 7, 'stack-config': 1, 'stack-lifecycle': 6};
    assert.ok(Object.hasOwn(counts, name));
    assert.equal(starts.length, counts[name]); assert.equal(ends.length, counts[name]);
    assert.equal(events.length, counts[name] * 2);
    if (name === 'stack-options') {
      const depths = [0, 0, 5, 5, 1, 3, platform === 'ios' ? 16 : 64];
      starts.forEach((e, i) => {
        assert.equal(method(e), 'contextLeaf'); assert.deepEqual(e.capture.args, {count: 0});
        if (depths[i]) {
          const frames = stack(e, depths[i], i < 6);
          if (depths[i] >= 3) assert.ok(frames.some(f => platform === 'android'
            ? f.methodName === 'contextDepth' : f.name?.includes('contextDepth')), 'real native/Java caller present');
        } else assert.equal(e.capture.stack, undefined);
        const exit = ends[i]; assert.equal(exit.capture.result, 7);
        assert.ok(Number.isFinite(exit.capture.elapsedMs) && exit.capture.elapsedMs >= 0);
        for (const value of Object.values(exit.capture.memory)) {
          assert.equal(value.unit, 'bytes'); assert.ok(Number.isSafeInteger(value.before));
          assert.ok(Number.isSafeInteger(value.after)); assert.equal(value.delta, value.after - value.before);
        }
      });
    } else if (name === 'stack-config') {
      stack(starts[0], 5, true); assert.equal(method(starts[0]), 'contextLeaf');
    } else {
      assert.deepEqual(events.slice(0, 8).map(e => e.phase), ['enter', 'enter', 'enter', 'enter', 'leave', 'leave', 'leave', 'leave']);
      assert.deepEqual(starts.slice(0, 4).map(e => e.capture.args), [3, 2, 1, 0]);
      assert.deepEqual(ends.slice(0, 4).map(e => e.capture.result), [7, 8, 9, 10]);
      starts.slice(0, 4).forEach(e => stack(e, 3));
      stack(starts[4], 5, true); stack(starts[5], 1, true);
    }
  }
  return {contract, records: events.length, methodRecords: methods.length, logRecords: logs.length};
}
