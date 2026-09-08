import { verifyUiState } from '../../../../common/ui-state-contract.mjs';
import assert from 'node:assert/strict';
import { verifyStateRuntime, verifyMethodMatching } from '../../../../common/state-runtime-contracts.mjs';
import { verifyChainContext } from '../../../../common/chain-context-contracts.mjs';
import { verifyCompleteCapture } from '../../../../common/chain-capture-contracts.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Evidence contract failed: ${message}`);
}

function requireEmpty(value, name) {
  const size = Array.isArray(value) ? value.length : Object.keys(value ?? {}).length;
  requireEvidence(size === 0, `${name} must be empty`);
}

function requireScreenshotPath(path, name) {
  requireEvidence(typeof path === 'string' && path.endsWith('.jpg'), `${name} screenshot path`);
}

function verifyUi(document) {
  requireEvidence(document.actionDescription === 'ApiDemo hidden fixture becomes visible', 'actionDescription');
  requireEmpty(document.chain, 'chain');
  requireEmpty(document.state, 'state');
  const fixture = document.ui?.hiddenFixture;
  requireEvidence(fixture?.className === 'android.widget.TextView', 'hiddenFixture className');
  requireEvidence(fixture?.before?.exist === true && fixture.before.visible === false, 'hiddenFixture before state');
  requireEvidence(fixture?.after?.exist === true && fixture.after.visible === true, 'hiddenFixture after state');
  requireEvidence(!Object.hasOwn(fixture, 'changed'), 'hiddenFixture must omit changed');
  requireEvidence(!Object.hasOwn(document, 'screenshots'), 'top-level screenshots must be absent');
  requireScreenshotPath(fixture.before?.screenshots?.window, 'before window');
  requireEvidence(fixture.before?.screenshots?.element === null, 'hidden before element crop must be null');
  requireScreenshotPath(fixture.after?.screenshots?.window, 'after window');
  requireScreenshotPath(fixture.after?.screenshots?.element, 'after hiddenFixture element');
  return { contract: 'ui-visibility-v4', screenshots: 3 };
}

function verifyCapture(contract, document) {
  requireEvidence(document.actionDescription === contract, 'capture actionDescription');
  requireEmpty(document.state, 'state');
  requireEmpty(document.ui, 'ui');
  const events = document.chain;
  requireEvidence(Array.isArray(events) && events.length > 0, 'method evidence must exist');
  requireEvidence(events.every(event => event.type === 'method'
    && event.className === 'com.agenteasyuse.mobileeasyuse.apidemo.state.ChainCaptureFixture'
    && ['enter', 'leave', 'throw'].includes(event.phase)), 'fixture methods only');
  requireEvidence(events.every(event => !Object.hasOwn(event, 'invocationId')), 'no public invocation ID');
  const starts = events.filter(event => event.phase === 'enter');
  const ends = events.filter(event => event.phase !== 'enter');
  requireEvidence(events.filter(event => event.phase === 'enter').length === ends.length, 'balanced completed fixture calls');
  function timing(capture, minimum = 0) {
    requireEvidence(typeof capture?.elapsedMs === 'number' && Number.isFinite(capture.elapsedMs), 'finite elapsedMs');
    requireEvidence(capture.elapsedMs >= minimum, 'minimum method delay');
  }
  function resources(capture, minimum = 0, errors = false) {
    timing(capture, minimum);
    for (const metric of ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes']) {
      const value = capture.memory?.[metric];
      requireEvidence(value?.unit === 'bytes', `${metric} unit`);
      requireEvidence(Number.isSafeInteger(value.before) && value.before >= 0
        && Number.isSafeInteger(value.after) && value.after >= 0, `${metric} actual reads`);
      requireEvidence(value.delta === value.after - value.before, `${metric} delta`);
    }
    if (!errors) requireEvidence(capture.captureErrors === undefined, 'unexpected capture errors');
  }
  const first = ends[0];
  const entry = starts[0];
  requireEvidence(ends.every(event => !Object.hasOwn(event.capture ?? {}, 'args')), 'args only on enter');
  requireEvidence(starts.every(event => !Object.hasOwn(event.capture ?? {}, 'result')
    && !Object.hasOwn(event.capture ?? {}, 'elapsedMs') && !Object.hasOwn(event.capture ?? {}, 'memory')), 'exit fields only on exit');
  if (contract === 'chain-capture-success-v2') {
    requireEvidence(ends.length === 1 && first.method === 'work' && first.phase === 'leave', 'one successful work');
    requireEvidence(entry.capture?.args?.key === 'success' && entry.capture.args.bytes === 262144
      && entry.capture.args.delayMs === 15, 'captured input');
    requireEvidence(first.capture.result?.value === 'success:262144', 'captured result');
    resources(first.capture, 15);
  } else if (contract === 'chain-capture-throw-v2') {
    requireEvidence(ends.length === 1 && first.method === 'fail' && first.phase === 'throw', 'throw event');
    assert.deepEqual(entry.argumentTypes, ['java.lang.String']);
    assert.deepEqual(first.argumentTypes, ['java.lang.String']);
    requireEvidence(first.error?.includes('CHAIN_CAPTURE_FAILURE:expected'), 'original Java error');
    requireEvidence(entry.capture?.args?.key === 'expected' && !Object.hasOwn(first.capture, 'result'), 'throw args and no result');
    resources(first.capture);
  } else if (contract === 'chain-capture-filter-v2') {
    requireEvidence(ends.length === 2 && first.method === 'work' && ends[1].method === 'plain', 'filter excludes skipped call');
    requireEvidence(entry.capture?.args?.key === 'keep' && first.capture.result === 'keep:0', 'matching invocation');
    requireEvidence(!Object.hasOwn(first.capture, 'memory') && !Object.hasOwn(first.capture, 'elapsedMs'), 'resource capture disabled');
    requireEvidence(!Object.hasOwn(ends[1], 'capture'), 'legacy event without capture');
  } else if (contract === 'chain-capture-recursive-v2') {
    requireEvidence(events.map(event => event.phase).join(',') === 'enter,enter,enter,leave,leave,leave', 'nested chronological order');
    requireEvidence(starts.map(event => event.capture?.args?.depth).join(',') === '2,1,0', 'outer-to-inner arguments');
    requireEvidence(ends.length === 3 && ends.every(event => event.method === 'recursive' && event.phase === 'leave'), 'three recursive calls');
    ends.forEach((event, depth) => {
      requireEvidence(starts.some(start => start.capture?.args?.depth === depth) && event.capture.result === depth + 1, 'recursive args/result pairing');
      timing(event.capture);
      requireEvidence(event.capture.captureErrors === undefined, 'recursive capture errors');
      if (depth > 0) requireEvidence(event.capture.elapsedMs >= ends[depth - 1].capture.elapsedMs, 'nested duration');
    });
  } else if (contract === 'chain-capture-errors-v2') {
    requireEvidence(ends.length === 1 && first.method === 'work' && first.phase === 'leave', 'business still succeeds');
    const errors = first.capture?.captureErrors;
    requireEvidence(entry.capture?.captureErrors?.length === 1 && entry.capture.captureErrors[0].field === 'args'
      && entry.capture.captureErrors[0].message === 'ARGS_CAPTURE_ERROR'
      && errors?.length === 1 && errors[0].field === 'result' && errors[0].message === 'RESULT_CAPTURE_ERROR', 'extraction error evidence');
    requireEvidence(!Object.hasOwn(first.capture, 'args') && !Object.hasOwn(first.capture, 'result'), 'failed extractions omitted');
    resources(first.capture, 0, true);
  } else if (contract === 'chain-capture-cleanup-v2') {
    requireEvidence(ends.length === 1 && first.method === 'plain' && first.phase === 'leave', 'restored single hook');
    requireEvidence(first.capture?.result === 'plain:restored' && first.capture.captureErrors === undefined, 'restored capture');
  } else throw new Error(`Unknown Evidence contract: ${contract}`);
  return { contract, calls: ends.length };
}

function verifyChainCapture(document) {
  requireEvidence(document.actionDescription === 'ApiDemo Java method and log chain', 'actionDescription');
  requireEmpty(document.state, 'state'); requireEmpty(document.ui, 'ui');
  const logs = document.chain.filter(event => event.type === 'log');
  requireEvidence(logs.length === 2 && logs.some(event => event.tag === 'MEU.ApiDemo' && event.message === 'chain-debug')
    && logs.some(event => event.tag === 'MEU.ApiDemo.Other' && event.message === 'chain-other'), 'selected logs only');
  const methods = document.chain.filter(event => event.type === 'method');
  requireEvidence(methods.length === 2 && methods[0].phase === 'enter' && methods[1].phase === 'leave', 'one completed method');
  requireEvidence(methods.every(event => event.className === 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState'
    && event.method === 'single'), 'fixture method identity');
  const entry = methods[0].capture;
  const exit = methods[1].capture;
  requireEvidence(entry?.args?.value === 'chain' && !entry.captureErrors, 'entry args capture');
  requireEvidence(exit?.result?.value === 'single:chain' && !exit.captureErrors, 'exit result capture');
  requireEvidence(!Object.hasOwn(exit, 'args') && !Object.hasOwn(exit, 'elapsedNs'), 'current exit format');
  requireEvidence(!Object.hasOwn(entry, 'result') && !Object.hasOwn(entry, 'memory') && !Object.hasOwn(entry, 'elapsedMs'), 'entry contains only entry data');
  requireEvidence(typeof exit.elapsedMs === 'number' && Number.isFinite(exit.elapsedMs) && exit.elapsedMs >= 0, 'numeric elapsedMs');
  for (const metric of ['javaHeapUsedBytes', 'nativeHeapAllocatedBytes']) {
    const value = exit.memory?.[metric];
    requireEvidence(value?.unit === 'bytes' && Number.isSafeInteger(value.before) && value.before >= 0
      && Number.isSafeInteger(value.after) && value.after >= 0 && value.delta === value.after - value.before, metric);
  }
  return { contract: 'chain-method-log-capture-v3', methodRecords: 2 };
}

function verifyEvidence(contract, document) {
  if (contract === 'ui-state-v1') return verifyUiState('android', document);
  if (contract.startsWith('state-runtime-')) return verifyStateRuntime(contract, document);
  if (contract.startsWith('chain-method-match-')) return verifyMethodMatching(contract, document);
  if (contract.startsWith('chain-context-')) return verifyChainContext('android', contract, document);
  if (contract.startsWith('chain-complete-')) return verifyCompleteCapture('android', contract, document);
  if (contract === 'chain-method-log-capture-v3') return verifyChainCapture(document);
  if (contract === 'ui-visibility-v4') return verifyUi(document);
  if (contract.startsWith('chain-capture-')) return verifyCapture(contract, document);
  throw new Error(`Unknown Evidence contract: ${contract}`);
}

async function main() {
  const [contract, filePath] = process.argv.slice(2);
  if (!contract || !filePath) {
    throw new Error('Usage: node verify-evidence.mjs <contract> <evidence.json>');
  }
  const document = JSON.parse(await readFile(filePath, 'utf8'));
  console.log(JSON.stringify({ passed: true, ...verifyEvidence(contract, document), evidencePath: filePath }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { verifyEvidence };
