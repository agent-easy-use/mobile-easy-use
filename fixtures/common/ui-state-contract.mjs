import assert from 'node:assert/strict';

/** Host-only oracle for one action composed from state and UI evidence. */
export function verifyUiState(platform, document) {
  assert.equal(document.actionDescription, 'ui-state-v1');
  assert.deepEqual(document.chain, []);
  assert.deepEqual(document.state, {
    'label.text': {path: 'label.text', before: platform === 'android' ? 'EVIDENCE_HIDDEN' : 'Probe UI hidden', after: 'UPDATED_LABEL'},
  });
  assert.deepEqual(Object.keys(document.ui), ['label']);
  const label = document.ui.label;
  assert.equal(label.className, platform === 'android' ? 'android.widget.TextView' : 'UILabel');
  assert.equal(Object.hasOwn(label, 'changed'), false);
  for (const checkpoint of ['before', 'after']) {
    const value = label[checkpoint];
    assert.equal(value.exist, true);
    assert.equal(value.visible, checkpoint === 'after');
    assert.ok(value.bounds.width > 0 && value.bounds.height > 0);
    assert.match(value.screenshots.window, /\.jpg$/);
    if (checkpoint === 'before') assert.equal(value.screenshots.element, null);
    else assert.match(value.screenshots.element, /\.jpg$/);
    if (platform === 'android') assert.deepEqual(value.properties, {});
  }
  return {contract: 'ui-state-v1', stateKeys: ['label.text'], uiKeys: ['label']};
}
