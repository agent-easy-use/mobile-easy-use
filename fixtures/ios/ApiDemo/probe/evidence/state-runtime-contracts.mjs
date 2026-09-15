import assert from 'node:assert/strict';

/** Host-only verification of real runtime state and matching manifests. */
export function verifyStateRuntime(contract, document) {
  assert.equal(document.actionDescription, contract);
  assert.deepEqual(document.chain, []);
  assert.deepEqual(document.ui, {});
  const state = document.state;
  assert.deepEqual(state.counter, {path: 'counter', before: 0, after: 1});
  const snapshot = (key, before, after) => assert.deepEqual(state[key], {path: key, before, after});
  if (contract === 'state-runtime-async-v1') {
    assert.deepEqual(Object.keys(state).sort(), ['counter', 'mainThread', 'secondCounter', 'syncNull']);
    snapshot('mainThread', true, true);
    snapshot('secondCounter', 0, 1);
    snapshot('syncNull', null, null);
  } else if (contract === 'state-runtime-getter-errors-v1') {
    snapshot('validNull', null, null);
    assert.deepEqual(Object.keys(state).sort(), ['counter', 'exception', 'rejection', 'validNull']);
    for (const [key, message] of [['rejection', 'ASYNC_GETTER_FAILED'], ['exception', 'SYNC_GETTER_FAILED']]) {
      assert.deepEqual(state[key], {path: key, errors: {before: message, after: message}});
    }
  } else if (contract === 'state-runtime-failure-v1') {
    assert.deepEqual(Object.keys(state).sort(), ['counter', 'failAfter', 'recover']);
    assert.deepEqual(state.recover, {path: 'recover', after: null, errors: {before: 'BEFORE_UNAVAILABLE'}});
    assert.deepEqual(state.failAfter, {path: 'failAfter', before: 7, errors: {after: 'AFTER_UNAVAILABLE'}});
  } else throw Error(`Unknown state runtime contract: ${contract}`);
  return {contract, stateKeys: Object.keys(state)};
}

export function verifyMethodMatching(contract, document) {
  assert.equal(document.actionDescription, contract);
  assert.deepEqual(document.state, {});
  assert.deepEqual(document.ui, {});
  const match = /^chain-method-match-(child-)?(instance|class)-v1$/.exec(contract);
  const kind = match ? (match[2] === 'instance' ? '-' : '+') : null;
  assert.ok(kind, 'known matching contract');
  assert.equal(document.chain.length, 4, 'only two matching calls, no post-cleanup event');
  assert.deepEqual(document.chain.map(event => event.phase), ['enter', 'leave', 'enter', 'leave']);
  assert.deepEqual(document.chain.map(event => event.className), Array(4).fill(match[1] ? 'APIMethodMatchChild' : 'APIMethodMatchFixture'));
  for (const event of document.chain) {
    assert.equal(event.type, 'method');
    assert.equal(event.selector, `${kind} match:`);
    assert.equal(Object.hasOwn(event.capture, 'captureErrors'), false);
  }
  assert.deepEqual(document.chain.filter(event => event.phase === 'enter').map(event => event.capture.args), [1, 2]);
  assert.deepEqual(document.chain.filter(event => event.phase === 'leave').map(event => event.capture.result), [11, 12]);
  return {contract, methodRecords: 4};
}
