import assert from 'node:assert/strict';
import test from 'node:test';

for (const platform of ['android', 'ios']) {
  const {verifyUiState} = await import(`../fixtures/${platform}/ApiDemo/probe/evidence/ui-state-contract.mjs`);
  test(`${platform}: composed UI/state oracle rejects missing, split or incorrect property evidence`, () => {
    const document = {actionDescription: 'ui-state-v1', chain: [], state: {
      'label.text': {path: 'label.text', before: platform === 'android' ? 'EVIDENCE_HIDDEN' : 'Probe UI hidden', after: 'UPDATED_LABEL'},
    }, ui: {label: {className: platform === 'android' ? 'android.widget.TextView' : 'UILabel',
      before: {exist: true, visible: false, bounds: {width: 100, height: 20}, properties: {}, screenshots: {window: '/tmp/before.jpg', element: null}},
      after: {exist: true, visible: true, bounds: {width: 100, height: 20}, properties: {}, screenshots: {window: '/tmp/after.jpg', element: '/tmp/label.jpg'}},
    }}};
    assert.equal(verifyUiState(platform, document).contract, 'ui-state-v1');
    const mutations = [d => {d.state = {};}, d => {d.ui = {};},
      d => {d.actionDescription = 'different action';}, d => {d.state['label.text'].after = 'stale';},
      d => {delete d.state['label.text'].before;}, d => {d.ui.label.after.screenshots.element = null;},
      d => {d.ui.label.changed = true;}];
    if (platform === 'android') mutations.push(d => {d.ui.label.after.properties.text = 'UPDATED_LABEL';});
    for (const mutate of mutations) {
      const bad = structuredClone(document); mutate(bad);
      assert.throws(() => verifyUiState(platform, bad));
    }
  });
}
