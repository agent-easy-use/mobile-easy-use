import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readIOSSigning } from '../../src/mcp-api/ios-signing.js';
import { prepareIOSRunner } from '../../src/mcp-api/ios-runner.js';

const target = { hardwareUdid: 'device-one', appId: 'com.example.app' };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'meu-host-signing-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory };
}

test('simulator preparation skips all signing', async () => {
  const options = {
    execute: async () => ({ stdout: JSON.stringify({ devices: { ios: [{ state: 'Booted', udid: 'sim-1' }] } }) }),
    readSigning: () => { throw new Error('must not sign simulator'); },
  };
  assert.deepEqual(await prepareIOSRunner({ deviceId: 'sim-1', appId: target.appId }, options), { physical: false, destinationId: 'sim-1', signing: null });
});

test('runtime requires saved configuration and never discovers teams', async t => {
  const options = await fixture(t);
  options.discoverTeams = () => { throw new Error('runtime must not discover'); };
  await assert.rejects(readIOSSigning(target, options), { code: 'IOS_SIGNING_SETUP_REQUIRED' });
  const record = { teamId: 'AAAAAAAAAA', bundleId: 'com.mobileeasyuse.runner.taaaaaaaaaa.r0123456789abcdef' };
  await mkdir(join(options.directory, 'devices'));
  const key = createHash('sha256').update(target.hardwareUdid).digest('hex');
  await writeFile(join(options.directory, 'devices', `${key}.json`), JSON.stringify(record));
  assert.deepEqual(await readIOSSigning(target, options), { ...record, source: 'saved' });
});

test('Host rejects malformed configuration without modifying it', async t => {
  const { createHash } = await import('node:crypto');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { directory } = await fixture(t);
  await mkdir(join(directory, 'devices'));
  const path = join(directory, 'devices', `${createHash('sha256').update(target.hardwareUdid).digest('hex')}.json`);
  for (const value of ['{', 'null', '{"teamId":"invalid","bundleId":"com.example.runner"}']) {
    await writeFile(path, value);
    await assert.rejects(readIOSSigning(target, { directory }), { code: 'IOS_SIGNING_CONFIG_ERROR' });
    assert.equal(await readFile(path, 'utf8'), value);
  }
});
