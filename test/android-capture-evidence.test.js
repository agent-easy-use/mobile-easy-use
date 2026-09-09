import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvidence } from '../fixtures/android/ApiDemo/probe/evidence/verify-evidence.mjs';

const metrics = () => Object.fromEntries(['javaHeapUsedBytes', 'nativeHeapAllocatedBytes']
  .map(key => [key, {unit:'bytes', before:200, after:100, delta:-100}]));
function document(contract, endings) {
  return {actionDescription:contract, state:{}, ui:{}, chain:endings.flatMap(original => {
    const end=structuredClone(original);
    const entryCapture={};
    if (end.capture && Object.hasOwn(end.capture, 'args')) { entryCapture.args=end.capture.args; delete end.capture.args; }
    if (end.capture?.captureErrors) {
      entryCapture.captureErrors=end.capture.captureErrors.filter(error => error.field === 'args');
      end.capture.captureErrors=end.capture.captureErrors.filter(error => error.field !== 'args');
    }
    return [
    {type:'method', className:'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture', method:end.method, argumentTypes:end.argumentTypes, phase:'enter', ...(Object.keys(entryCapture).length ? {capture:entryCapture} : {})},
    {type:'method', className:'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture', phase:'leave', ...end},
  ]; })};
}
const cases = [
  ['success', [{method:'work', capture:{args:{key:'success',bytes:262144,delayMs:15}, result:{value:'success:262144'},elapsedMs:15,memory:metrics()}}]],
  ['throw', [{method:'fail',argumentTypes:['java.lang.String'],phase:'throw',error:'CHAIN_CAPTURE_FAILURE:expected',capture:{args:{key:'expected'},elapsedMs:0.0001,memory:metrics()}}]],
  ['filter', [{method:'work',capture:{args:{key:'keep'},result:'keep:0'}},{method:'plain'}]],
  ['recursive', [0,1,2].map(depth => ({method:'recursive',capture:{args:{depth},result:depth+1,elapsedMs:depth+1}}))],
  ['errors', [{method:'work',capture:{elapsedMs:0.001,memory:metrics(),captureErrors:[{field:'args',message:'ARGS_CAPTURE_ERROR'},{field:'result',message:'RESULT_CAPTURE_ERROR'}]}}]],
  ['cleanup', [{method:'plain',capture:{result:'plain:restored'}}]],
];
for (const [name,endings] of cases) {
  test(`capture ${name} verifier requires runtime evidence, not RPC success`, () => {
    const contract = `chain-capture-${name}-v2`;
    const valid = document(contract,endings);
    if (name === 'recursive') valid.chain = [
      ...valid.chain.filter(e => e.phase === 'enter').reverse(),
      ...valid.chain.filter(e => e.phase === 'leave'),
    ];
    assert.equal(verifyEvidence(contract,valid).calls,endings.length);
    if (name === 'recursive') {
      const reordered = structuredClone(valid);
      [reordered.chain[0], reordered.chain[1]] = [reordered.chain[1], reordered.chain[0]];
      assert.throws(() => verifyEvidence(contract, reordered));
    }
    const missing = structuredClone(valid); missing.chain.at(-1).capture = undefined;
    if (name === 'filter') missing.chain[1].capture = undefined;
    assert.throws(() => verifyEvidence(contract,missing));
    assert.throws(() => verifyEvidence(contract,{...valid,chain:[]}));
  });
}
test('success verifier rejects absent memory reads, bad deltas and tool-duration substitutes', () => {
  const contract='chain-capture-success-v2';
  const valid=document(contract,cases[0][1]);
  for (const mutate of [
    capture => {capture.memory.javaHeapUsedBytes.before=null;},
    capture => {capture.memory.nativeHeapAllocatedBytes.delta=0;},
    capture => {capture.elapsedMs=0.001;},
    capture => {capture.captureErrors=[{field:'memory',message:'unavailable'}];},
  ]) {
    const bad=structuredClone(valid); mutate(bad.chain[1].capture);
    assert.throws(() => verifyEvidence(contract,bad),/Evidence contract failed/);
  }
});
