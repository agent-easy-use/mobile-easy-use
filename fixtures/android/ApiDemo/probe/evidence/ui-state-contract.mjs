import assert from 'node:assert/strict';

/** Class lookup must target the first subclass, with one real click and usable crops. */
export function verifyClassUi(platform, document) {
  assert.equal(document.actionDescription, 'class-ui-v1');
  assert.deepEqual(document.chain, []);
  assert.deepEqual(document.state, {
    state: { path: 'state',
      before: { clickCount: 0, first: 'FIRST', second: 'SECOND', outside: 'OUTSIDE' },
      after: { clickCount: 1, first: 'FIRST:1', second: 'SECOND', outside: 'OUTSIDE' } },
  });
  assert.deepEqual(Object.keys(document.ui), ['first']);
  assert.equal(document.ui.first.className, platform === 'android'
    ? 'com.agenteasyuse.mobileeasyuse.apidemo.ui.UiActivity$ClassButton' : 'APIClassButton');
  for (const checkpoint of ['before', 'after']) {
    const value = document.ui.first[checkpoint];
    assert.equal(value.exist, true);
    assert.equal(value.visible, true);
    assert.ok(value.bounds.width > 0 && value.bounds.height > 0);
    assert.match(value.screenshots.window, /\.jpg$/);
    assert.match(value.screenshots.element, /\.jpg$/);
    if (platform === 'ios') assert.equal(value.properties.identifier, 'api.ui.class.first');
  }
  return { contract: 'class-ui-v1', stateKeys: ['state'], uiKeys: ['first'] };
}

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
