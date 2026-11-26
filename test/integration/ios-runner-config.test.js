import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('iOS XCTest runner uses its dedicated listen endpoint', async () => {
  const config = JSON.parse(await readFile(
    'runners/ios-xctest/MobileEasyUseRuntime.config',
    'utf8',
  ));

  assert.deepEqual(config.interaction, {
    type: 'listen',
    address: '0.0.0.0',
    port: 8485,
    on_port_conflict: 'fail',
    on_load: 'resume',
  });
  assert.equal(config.code_signing, 'required');
});
