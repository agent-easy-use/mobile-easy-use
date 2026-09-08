import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyStateRuntime, verifyMethodMatching} from '../fixtures/common/state-runtime-contracts.mjs';

test('state runtime oracle rejects absent reads and failure disguised as null', () => {
  const contract = 'state-runtime-failure-v1';
  const document = {actionDescription: contract, chain: [], ui: {}, state: {
    counter: {path: 'counter', before: 0, after: 1},
    recover: {path: 'recover', after: null, errors: {before: 'BEFORE_UNAVAILABLE'}},
    failAfter: {path: 'failAfter', before: 7, errors: {after: 'AFTER_UNAVAILABLE'}},
  }};
  assert.equal(verifyStateRuntime(contract, document).contract, contract);
  for (const mutate of [d => {d.state.recover.before = null;}, d => {delete d.state.recover.errors;},
    d => {delete d.state.counter.after;}, d => {d.state.counter.changed = true;}]) {
    const bad = structuredClone(document); mutate(bad); assert.throws(() => verifyStateRuntime(contract, bad));
  }
});

test('matching oracle rejects alias/sibling leakage, wrong labels and missing calls', () => {
  const contract = 'chain-method-match-instance-v1';
  const document = {actionDescription: contract, state: {}, ui: {}, chain: [1, 2].flatMap(value => [
    {type: 'method', className: 'APIMethodMatchFixture', selector: '- match:', phase: 'enter', capture: {args: value}},
    {type: 'method', className: 'APIMethodMatchFixture', selector: '- match:', phase: 'leave', capture: {result: value + 10}},
  ])};
  assert.equal(verifyMethodMatching(contract, document).methodRecords, 4);
  for (const mutate of [d => {d.chain.push(d.chain[0]);}, d => {d.chain[0].selector = '- alias:';},
    d => {d.chain[2].className = 'APIMethodMatchChild';}, d => {d.chain.pop();},
    d => {d.chain[0].capture.args = 5;}]) {
    const bad = structuredClone(document); mutate(bad); assert.throws(() => verifyMethodMatching(contract, bad));
  }
});

for (const kind of ['instance', 'class']) {
  test(`child ${kind} matching oracle rejects parent leakage and parent labels`, () => {
    const contract = `chain-method-match-child-${kind}-v1`;
    const selector = `${kind === 'instance' ? '-' : '+'} match:`;
    const document = {actionDescription: contract, state: {}, ui: {}, chain: [1, 2].flatMap(value => [
      {type: 'method', className: 'APIMethodMatchChild', selector, phase: 'enter', capture: {args: value}},
      {type: 'method', className: 'APIMethodMatchChild', selector, phase: 'leave', capture: {result: value + 10}},
    ])};
    assert.equal(verifyMethodMatching(contract, document).methodRecords, 4);
    for (const mutate of [d => {d.chain.push(...d.chain.slice(0, 2));},
      d => {d.chain[0].className = 'APIMethodMatchFixture';}, d => {d.chain[0].capture.args = 10;}]) {
      const bad = structuredClone(document); mutate(bad); assert.throws(() => verifyMethodMatching(contract, bad));
    }
  });
}
