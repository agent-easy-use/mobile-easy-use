import assert from 'node:assert/strict';
import test from 'node:test';
import { AssertionError, createExpect } from '../../sdk/common/test/expect.js';
import { create } from '../../sdk/common/test/index.js';

// Mock the Frida transport boundary; no Host process or image files are required.
function controller(context) {
  const receivers = new Map();
  const requests = [];
  const state = { reply: { ok: true, responsePayload: { matches: true } }, error: null, requests };
  for (const name of ['send', 'recv']) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    context.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  globalThis.recv = (type, callback) => receivers.set(type, callback);
  globalThis.send = event => {
    if (state.error) throw state.error;
    requests.push(event.payload);
    const type = `mobile-easy-use.controller.response.${event.payload.requestId}`;
    const callback = receivers.get(type);
    receivers.delete(type);
    callback({ payload: state.reply });
  };
  return state;
}

for (const [matcher, captureName, target] of [
  ['toMatchElementScreenshot', 'screenshotElement', { name: 'submit' }],
  ['toMatchWindowScreenshot', 'screenshotWindow', undefined],
]) {
  test(`${matcher} handles matches, negation and failure reports`, async context => {
    const host = controller(context);
    const captures = [];
    const screenshots = {
      async [captureName](...args) {
        captures.push(args);
        return { filePath: '/actual.png' };
      },
    };
    const expect = createExpect(screenshots);
    await expect(target)[matcher]('/baseline.png', { maxDiffPixelRatio: 0.1 });
    assert.deepEqual(captures, [target === undefined ? [] : [target]]);
    assert.equal(host.requests[0].action, 'screenshot.compare');
    assert.deepEqual(host.requests[0].payload, {
      actualPath: '/actual.png', baselinePath: '/baseline.png', options: { maxDiffPixelRatio: 0.1 },
    });
    await assert.rejects(expect(target).not[matcher]('/baseline.png'), AssertionError);

    host.reply = { ok: true, responsePayload: {
      matches: false, message: 'pixels differ', baselinePath: '/resolved-baseline.png',
    } };
    await expect(target).not[matcher]('baseline.png');
    await assert.rejects(expect(target, 'checkout')[matcher]('baseline.png'), error => {
      assert.ok(error instanceof AssertionError);
      assert.match(error.message, /checkout: pixels differ/);
      assert.equal(error.matcher, matcher);
      assert.equal(error.actual, JSON.stringify('/actual.png'));
      assert.equal(error.expected, JSON.stringify('/resolved-baseline.png'));
      return true;
    });

    const suite = create(screenshots);
    suite.describe('visual', () => {
      suite.test('checkout', () => suite.expect(target)[matcher]('baseline.png'));
    });
    const report = await suite.run();
    assert.equal(report.ok, false);
    assert.equal(report.failed, 1);
    assert.equal(report.tests[0].errors[0].matcher, matcher);
    assert.equal(report.tests[0].errors[0].phase, 'test');
  });

  test(`${matcher} preserves capture, comparison and transport failures under not`, async context => {
    const host = controller(context);
    let captureResult = new Error('capture failed');
    const screenshots = { async [captureName]() {
      if (captureResult instanceof Error) throw captureResult;
      return captureResult;
    } };
    const expect = createExpect(screenshots);
    await assert.rejects(expect(target).not[matcher]('/baseline.png'), /capture failed/);
    captureResult = {};
    await assert.rejects(expect(target).not[matcher]('/baseline.png'), /requested image/);
    assert.equal(host.requests.length, 0);
    const invalidTarget = target === undefined ? 'unexpected' : undefined;
    await assert.rejects(expect(invalidTarget)[matcher]('/baseline.png'), TypeError);
    captureResult = { filePath: '/actual.png' };
    host.reply = { ok: false, responsePayload: { error: { message: 'comparison failed' } } };
    await assert.rejects(expect(target).not[matcher]('/baseline.png'), /comparison failed/);
    host.reply = { ok: true, responsePayload: { matches: 'true' } };
    await assert.rejects(expect(target).not[matcher]('/baseline.png'), /boolean/);
    host.error = new Error('transport failed');
    await assert.rejects(expect(target).not[matcher]('/baseline.png'), /transport failed/);
  });
}
