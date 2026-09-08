import { verifyUiState } from '../../../../common/ui-state-contract.mjs';
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

function verifyState(document) {
  requireEvidence(document.actionDescription === 'ApiDemo iOS click state', 'actionDescription');
  requireEmpty(document.chain, 'chain');
  requireEmpty(document.ui, 'ui');
  const counter = document.state?.counter;
  requireEvidence(counter?.before === 0 && counter?.after === 1, 'counter must change from 0 to 1');
  requireEvidence(!Object.hasOwn(counter, 'changed'), 'counter must omit changed');
  const scenario = document.state?.scenario;
  requireEvidence(scenario?.before === 'state_evidence' && scenario?.after === 'state_evidence', 'scenario must remain state_evidence');
  requireEvidence(!Object.hasOwn(scenario, 'changed'), 'scenario must omit changed');
  requireEvidence(Object.keys(document.state ?? {}).length === 2, 'state must contain exactly counter and scenario');
  return { contract: 'state-click-v2', stateKeys: ['counter', 'scenario'] };
}

function verifyUi(document) {
  requireEvidence(document.actionDescription === 'ApiDemo iOS visibility evidence', 'actionDescription');
  requireEmpty(document.chain, 'chain');
  requireEmpty(document.state, 'state');
  const fixture = document.ui?.hiddenFixture;
  requireEvidence(fixture?.className === 'UILabel', 'hiddenFixture className');
  requireEvidence(fixture?.before?.exist === true && fixture.before.visible === false, 'hiddenFixture before state');
  requireEvidence(fixture?.after?.exist === true && fixture.after.visible === true, 'hiddenFixture after state');
  requireEvidence(fixture?.before?.bounds?.width > 0 && fixture.before?.bounds?.height > 0, 'before bounds');
  requireEvidence(fixture?.after?.bounds?.width > 0 && fixture.after?.bounds?.height > 0, 'after bounds');
  requireEvidence(fixture?.after?.properties?.identifier === 'api.probe.ui.hidden', 'identifier property');
  requireEvidence(fixture?.after?.properties?.label === 'PROBE_HIDDEN_LABEL', 'label property');
  requireEvidence(!Object.hasOwn(fixture, 'changed'), 'hiddenFixture must omit changed');
  const missing = document.ui?.missingFixture;
  requireEvidence(missing?.before?.exist === false && missing?.after?.exist === false, 'missingFixture existence');
  requireEvidence(!Object.hasOwn(missing, 'changed'), 'missingFixture must omit changed');
  requireEvidence(Object.keys(document.ui ?? {}).length === 2, 'ui must contain exactly two fixtures');
  requireEvidence(!Object.hasOwn(document, 'screenshots'), 'top-level screenshots must be absent');
  requireScreenshotPath(fixture.before?.screenshots?.window, 'before window');
  requireEvidence(fixture.before?.screenshots?.element === null, 'hidden before element crop must be null');
  requireScreenshotPath(fixture.after?.screenshots?.window, 'after window');
  requireScreenshotPath(fixture.after?.screenshots?.element, 'after hiddenFixture element');
  requireScreenshotPath(missing.before?.screenshots?.window, 'missingFixture before window');
  requireEvidence(missing.before?.screenshots?.element === null, 'missing before element crop must be null');
  requireScreenshotPath(missing.after?.screenshots?.window, 'missingFixture after window');
  requireEvidence(missing.after?.screenshots?.element === null, 'missing after element crop must be null');
  requireEvidence(missing.before.screenshots.window === fixture.before.screenshots.window, 'before Window screenshot must be shared');
  requireEvidence(missing.after.screenshots.window === fixture.after.screenshots.window, 'after Window screenshot must be shared');
  return { contract: 'ui-visibility-v4', uiKeys: ['hiddenFixture', 'missingFixture'], screenshots: 3 };
}

function verifyChain(document) {
  requireEvidence(document.actionDescription === 'ApiDemo iOS method and log chain', 'actionDescription');
  requireEmpty(document.state, 'state');
  requireEmpty(document.ui, 'ui');
  const chain = document.chain ?? [];
  const methods = chain.filter((item) => item.type === 'method');
  const logs = chain.filter((item) => item.type === 'log');
  requireEvidence(methods.length === 2, 'exactly two method records');
  requireEvidence(methods[0]?.className === 'APISDKFixtureState', 'method className');
  requireEvidence(methods.every((item) => item.selector === '- single:'), 'method selector');
  requireEvidence(methods.map((item) => item.phase).join(',') === 'enter,leave', 'method phases');
  requireEvidence(logs.length === 3, 'exactly three static and dynamic log records');
  requireEvidence(logs.some((item) => item.tag === 'MEU.ApiDemo'
    && item.message === '[MEU.ApiDemo] chain-primary value=42'), 'primary log');
  requireEvidence(logs.some((item) => item.tag === 'MEU.ApiDemo.Other'
    && item.message === '[MEU.ApiDemo.Other] chain-secondary'), 'secondary log');
  requireEvidence(logs.some((item) => item.tag === 'MEU.ApiDemo'
    && item.message === '[MEU.ApiDemo]chain-dynamic'), 'dynamic TAG log');
  return { contract: 'chain-method-log-v2', methodRecords: 2, logRecords: 3 };
}

function verifyChainCapture(document) {
  verifyChain(document);
  const methods = document.chain.filter(event => event.type === 'method');
  requireEvidence(methods.length === 2 && methods[0].phase === 'enter' && methods[1].phase === 'leave', 'one completed method');
  const entry = methods[0].capture;
  const exit = methods[1].capture;
  requireEvidence(entry?.args?.value === 'chain' && !entry.captureErrors, 'entry args capture');
  requireEvidence(exit?.result?.value === 'single:chain' && !exit.captureErrors, 'exit result capture');
  requireEvidence(!Object.hasOwn(exit, 'args') && !Object.hasOwn(exit, 'elapsedNs'), 'current exit format');
  requireEvidence(!Object.hasOwn(entry, 'result') && !Object.hasOwn(entry, 'memory') && !Object.hasOwn(entry, 'elapsedMs'), 'entry contains only entry data');
  requireEvidence(typeof exit.elapsedMs === 'number' && Number.isFinite(exit.elapsedMs) && exit.elapsedMs >= 0, 'numeric elapsedMs');
  for (const metric of ['physicalFootprintBytes']) {
    const value = exit.memory?.[metric];
    requireEvidence(value?.unit === 'bytes' && Number.isSafeInteger(value.before) && value.before >= 0
      && Number.isSafeInteger(value.after) && value.after >= 0 && value.delta === value.after - value.before, metric);
  }
  return { contract: 'chain-method-log-capture-v3', methodRecords: 2 };
}

function verifyEvidence(contract, document) {
  if (contract === 'ui-state-v1') return verifyUiState('ios', document);
  if (contract.startsWith('state-runtime-')) return verifyStateRuntime(contract, document);
  if (contract.startsWith('chain-method-match-')) return verifyMethodMatching(contract, document);
  if (contract.startsWith('chain-context-')) return verifyChainContext('ios', contract, document);
  if (contract.startsWith('chain-complete-')) return verifyCompleteCapture('ios', contract, document);
  if (contract === 'chain-method-log-capture-v3') return verifyChainCapture(document);
  if (contract === 'state-click-v2') return verifyState(document);
  if (contract === 'ui-visibility-v4') return verifyUi(document);
  if (contract === 'chain-method-log-v2') return verifyChain(document);
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
