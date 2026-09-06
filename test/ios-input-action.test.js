import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INPUT_ACTION_SETTLE_DELAY_MS,
  runInputAction,
} from '../sdk/ios/common/input-action.js';

test('iOS input requests a 1000 ms wait after the terminal native action', async () => {
  const events = [];
  const result = await runInputAction(
    async () => {
      events.push('action');
      return { ok: true, action: 'click' };
    },
    async (durationMs) => {
      events.push(`wait:${durationMs}`);
    },
  );

  assert.equal(INPUT_ACTION_SETTLE_DELAY_MS, 1000);
  assert.deepEqual(events, ['action', 'wait:1000']);
  assert.deepEqual(result, { ok: true, action: 'click' });
});

test('iOS input default completion waits for the settle interval', async () => {
  const startedAt = performance.now();

  await runInputAction(async () => ({ ok: true, action: 'click' }));

  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs >= 900, `expected at least 900 ms, received ${elapsedMs} ms`);
});

test('iOS input also waits after a native failure result', async () => {
  let waited = false;
  const failure = { ok: false, action: 'input', error: { code: 'VIEW_NOT_FOUND' } };

  const result = await runInputAction(
    async () => failure,
    async () => {
      waited = true;
    },
  );

  assert.equal(waited, true);
  assert.equal(result, failure);
});

test('iOS input propagates thrown errors without a settle wait', async () => {
  let waited = false;

  await assert.rejects(
    runInputAction(
      async () => {
        throw new Error('transport failed');
      },
      async () => {
        waited = true;
      },
    ),
    /transport failed/,
  );

  assert.equal(waited, false);
});
