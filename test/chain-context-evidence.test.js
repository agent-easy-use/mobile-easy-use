import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyChainContext} from '../fixtures/common/chain-context-contracts.mjs';

for (const platform of ['android', 'ios']) {
  test(`${platform}: stack oracle rejects missing context, wrong depth, wrong phase and errors`, () => {
    const contract = 'chain-context-stack-config-v1';
    const base = {type: 'method', threadName: 'worker',
      className: platform === 'ios' ? 'APIChainCaptureFixture' : 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture',
      ...(platform === 'ios' ? {selector: '- contextLeaf'} : {method: 'contextLeaf'})};
    const frame = platform === 'ios' ? {address: '0x1000', moduleName: 'ApiDemo', name: 'contextDepth', fileName: null}
      : {className: base.className, methodName: 'contextDepth', signature: 'contextDepth(I)I'};
    const document = {actionDescription: contract, state: {}, ui: {}, chain: [
      {...base, phase: 'enter', capture: {stack: {kind: platform === 'ios' ? 'native' : 'java', frames: Array(5).fill(frame)}}},
      {...base, phase: 'leave'},
    ]};
    const verify = value => verifyChainContext(platform, contract, value);
    assert.equal(verify(document).records, 2);
    for (const mutate of [
      d => {delete d.chain[0].threadName;}, d => {d.chain[0].threadName = 1;},
      d => {d.chain[0].capture.stack.frames.pop();}, d => {d.chain[0].capture.stack.frames.push(frame);},
      d => {d.chain[0].capture.stack.kind = 'wrong';}, d => {d.chain[1].capture = d.chain[0].capture;},
      d => {d.chain[0].capture.captureErrors = [{field: 'stack', message: 'unavailable'}];},
    ]) {
      const changed = structuredClone(document); mutate(changed); assert.throws(() => verify(changed));
    }
  });
}
