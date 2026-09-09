import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyEvidence as verifyAndroidEvidence } from '../fixtures/android/ApiDemo/probe/evidence/verify-evidence.mjs';
import { verifyEvidence } from '../fixtures/ios/ApiDemo/probe/evidence/verify-evidence.mjs';

function screenshot(checkpoint, scope, uiKey) {
  return `/tmp/${checkpoint}-${scope}${uiKey ? `-${uiKey}` : ''}.jpg`;
}

test('iOS State Evidence contract verifies before and after snapshots', () => {
  const result = verifyEvidence('state-click-v2', {
    actionDescription: 'ApiDemo iOS click state',
    chain: [],
    ui: {},
    state: {
      counter: { before: 0, after: 1 },
      scenario: { before: 'state_evidence', after: 'state_evidence' },
    },
  });
  assert.equal(result.contract, 'state-click-v2');
});

test('iOS UI Evidence contract rejects the previous false-positive artifact', () => {
  const beforeWindow = screenshot('before', 'window');
  const afterWindow = screenshot('after', 'window');
  const afterElement = screenshot('after', 'element', 'hiddenFixture');
  const valid = {
    actionDescription: 'ApiDemo iOS visibility evidence',
    chain: [],
    state: {},
    ui: {
      hiddenFixture: {
        className: 'UILabel',
        before: { exist: true, visible: false, bounds: { x: 20, y: 100, width: 322, height: 52 }, properties: { identifier: 'api.probe.ui.hidden', label: 'PROBE_HIDDEN_LABEL' }, screenshots: { window: beforeWindow, element: null } },
        after: { exist: true, visible: true, bounds: { x: 20, y: 100, width: 322, height: 52 }, properties: { identifier: 'api.probe.ui.hidden', label: 'PROBE_HIDDEN_LABEL' }, screenshots: { window: afterWindow, element: afterElement } },
      },
      missingFixture: {
        before: { exist: false, visible: false, bounds: null, properties: {}, screenshots: { window: beforeWindow, element: null } },
        after: { exist: false, visible: false, bounds: null, properties: {}, screenshots: { window: afterWindow, element: null } },
      },
    },
  };
  assert.equal(verifyEvidence('ui-visibility-v4', valid).contract, 'ui-visibility-v4');

  const obsolete = structuredClone(valid);
  obsolete.ui.hiddenFixture.changed = true;
  assert.throws(() => verifyEvidence('ui-visibility-v4', obsolete), /omit changed/);

  const falsePositive = structuredClone(valid);
  falsePositive.ui.hiddenFixture.after.visible = false;
  falsePositive.ui.hiddenFixture.after.bounds = null;
  assert.throws(() => verifyEvidence('ui-visibility-v4', falsePositive), /after state/);
});

test('Android UI Evidence contract uses checkpoint-local screenshots', () => {
  const beforeWindow = screenshot('before', 'window');
  const afterWindow = screenshot('after', 'window');
  const document = {
    actionDescription: 'ApiDemo hidden fixture becomes visible',
    chain: [], state: {},
    ui: {
      hiddenFixture: {
        className: 'android.widget.TextView',
        before: { exist: true, visible: false, screenshots: { window: beforeWindow, element: null } },
        after: { exist: true, visible: true, screenshots: { window: afterWindow, element: screenshot('after', 'element', 'hiddenFixture') } },
      },
    },
  };
  assert.equal(verifyAndroidEvidence('ui-visibility-v4', document).contract, 'ui-visibility-v4');
  const obsolete = structuredClone(document);
  obsolete.ui.hiddenFixture.changed = true;
  assert.throws(() => verifyAndroidEvidence('ui-visibility-v4', obsolete), /omit changed/);
  assert.throws(
    () => verifyAndroidEvidence('ui-visibility-v4', { ...document, screenshots: [afterWindow] }),
    /top-level screenshots must be absent/,
  );
});

test('iOS Chain Evidence contract requires method phases plus static and dynamic logs', () => {
  const method = (phase) => ({
    type: 'method',
    className: 'APISDKFixtureState',
    selector: '- single:',
    phase,
  });
  const log = (tag, message) => ({
    type: 'log',
    level: 'default',
    tag,
    message,
  });
  const valid = {
    actionDescription: 'ApiDemo iOS method and log chain',
    state: {},
    ui: {},
    chain: [
      method('enter'),
      method('leave'),
      log('MEU.ApiDemo', '[MEU.ApiDemo] chain-primary value=42'),
      log('MEU.ApiDemo.Other', '[MEU.ApiDemo.Other] chain-secondary'),
      log('MEU.ApiDemo', '[MEU.ApiDemo]chain-dynamic'),
    ],
  };
  assert.equal(verifyEvidence('chain-method-log-v2', valid).contract, 'chain-method-log-v2');

  assert.throws(
    () => verifyEvidence('chain-method-log-v2', { ...valid, chain: valid.chain.slice(0, 2) }),
    /three static and dynamic log records/,
  );
});
