import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyCompleteCapture} from '../fixtures/common/chain-capture-contracts.mjs';

for (const platform of ['android', 'ios']) {
  test(`${platform}: concurrent oracle accepts out-of-order completion and rejects mixed/lost capture`, () => {
    const contract = 'chain-complete-concurrent-v1';
    const base = {type: 'method', className: platform === 'ios' ? 'APIChainCaptureFixture'
      : 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture',
    ...(platform === 'ios' ? {selector: '- worker:'} : {method: 'worker'})};
    const metrics = platform === 'ios' ? ['physicalFootprintBytes'] : ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes'];
    const memory = Object.fromEntries(metrics.map(m => [m, {unit: 'bytes', before: 100, after: 90, delta: -10}]));
    const document = {actionDescription: contract, state: {}, ui: {}, chain: [
      ...[1, 2].map(id => ({...base, phase: 'enter', capture: {args: {id}}})),
      ...[2, 1].map(id => ({...base, phase: 'leave', capture: {result: {id, value: id * 10}, elapsedMs: 50.25, memory}})),
    ]};
    const verify = d => verifyCompleteCapture(platform, contract, d);
    assert.equal(verify(document).methodRecords, 4);
    for (const mutate of [
      d => d.chain.pop(),
      d => { d.chain[2].capture.result.id = 1; },
      d => { d.chain[2].capture.memory[metrics[0]].delta = 0; },
      d => { d.chain[2].capture.memory[metrics[0]].before = null; },
      d => { d.chain[2].capture.elapsedMs = '50.25'; },
      d => { d.chain[2].capture.elapsedMs = -1; },
      d => { d.chain[0].capture.result = 10; },
      d => { d.chain[2].capture.args = {id: 2}; },
      d => { d.chain[2].capture.captureErrors = [{field: 'result', message: 'failed'}]; },
      d => { d.chain[0].className = 'WrongClass'; },
      d => { [d.chain[1], d.chain[2]] = [d.chain[2], d.chain[1]]; },
    ]) {
      const changed = structuredClone(document); mutate(changed);
      assert.throws(() => verify(changed));
    }
  });
}
