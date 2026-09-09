import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyCompleteCapture} from '../fixtures/android/ApiDemo/probe/evidence/chain-capture-contracts.mjs';

for (const platform of ['android', 'ios']) {
  const {verifyCompleteCapture} = await import(`../fixtures/${platform}/ApiDemo/probe/evidence/chain-capture-contracts.mjs`);
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

for (const name of ['static', 'overloads', 'scalars']) {
  test(`Android ${name} oracle requires actual signatures on both phases`, () => {
    const cases = name === 'static' ? [['staticValue', [], {count: 0}, 'static-original']]
      : name === 'overloads' ? [['overloaded', ['int']], ['overloaded', ['java.lang.String']]]
      : [['booleanValue', ['boolean'], false, false], ['wideValue', ['long'], '-9223372036854775808', '-9223372036854775808'],
        ['nullable', ['java.lang.String'], null, null], ['consume', ['java.lang.String'], null, null], ['overloaded', ['int'], 7, 'int:7']];
    const contract = `chain-complete-${name}-v1`;
    const document = {actionDescription: contract, state: {}, ui: {}, chain: cases.flatMap(([method, argumentTypes, args, result]) =>
      ['enter', 'leave'].map(phase => ({type: 'method', method, argumentTypes, phase,
        className: `com.agenteasyuse.mobileeasyuse.apidemo.state.${name === 'static' ? 'SdkFixtureState' : 'ChainCaptureFixture'}`,
        ...(name === 'overloads' ? {} : {capture: phase === 'enter' ? {args} : {result, ...(name === 'static' ? {elapsedMs: 0} : {})}}),
      }))) };
    assert.equal(verifyCompleteCapture('android', contract, document).contract, contract);
    for (const mutate of [d => {delete d.chain[0].argumentTypes;},
      d => {delete d.chain.at(-1).argumentTypes;}, d => {d.chain.at(-1).argumentTypes = ['wrong.Type'];}]) {
      const bad = structuredClone(document); mutate(bad);
      assert.throws(() => verifyCompleteCapture('android', contract, bad));
    }
  });
}
