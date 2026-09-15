import assert from 'node:assert/strict';

/** Verify persisted evidence, independently of the probe's in-memory checkpoints. */
export function verifyOverrideComposition(platform, document) {
  const baseline = document.actionDescription === 'override-driver-evidence-baseline';
  assert.ok(baseline || document.actionDescription === 'override-driver-evidence-mock');
  const originalLabel = platform === 'android' ? 'single:chain' : 'single:ui-chain';
  const initialLabel = platform === 'android' ? 'No chain captured' : 'Objective-C method + log';
  assert.deepEqual(document.state, {outcome: {path: 'outcome',
    before: {label: baseline ? initialLabel : originalLabel, originalCalls: baseline ? 0 : 1},
    after: {label: baseline ? originalLabel : 'composed-mock', originalCalls: 1}}});
  assert.deepEqual(Object.keys(document.ui), ['result']);
  const ui = document.ui.result;
  assert.equal(ui.className, platform === 'android' ? 'android.widget.TextView' : 'UIButton');
  for (const checkpoint of ['before', 'after']) {
    assert.equal(ui[checkpoint].exist, true);
    assert.equal(ui[checkpoint].visible, true);
    assert.ok(ui[checkpoint].bounds.width > 0 && ui[checkpoint].bounds.height > 0);
    assert.match(ui[checkpoint].screenshots.window, /\.jpg$/);
    assert.match(ui[checkpoint].screenshots.element, /\.jpg$/);
    assert.equal(ui[checkpoint].error, undefined);
    if (platform === 'ios') {
      assert.equal(ui[checkpoint].properties.identifier, 'api.probe.action');
      assert.equal(ui[checkpoint].properties.label, document.state.outcome[checkpoint].label);
    }
  }
  assert.equal(document.chain.length, 2);
  assert.deepEqual(document.chain.map(x => x.phase), ['enter', 'leave']);
  for (const event of document.chain) {
    assert.equal(event.type, 'method');
    assert.equal(event.className, platform === 'android'
      ? 'com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState' : 'APISDKFixtureState');
    if (platform === 'android') {
      assert.equal(event.method, 'emitDebugLog');
      assert.deepEqual(event.argumentTypes, []);
    } else assert.equal(event.selector, '- emitPrimaryLog');
  }
  return {contract: 'override-composition-v1', actionDescription: document.actionDescription};
}
