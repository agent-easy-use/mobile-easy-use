import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureSigning } from '../skills/to-ios-integrate/scripts/prepare-signing.mjs';
import { resolveIOSSigning } from '../skills/to-ios-integrate/scripts/signing.mjs';
import { readIOSSigning } from '../src/mcp-api/ios-signing.js';

test('setup saves only verified signing; failed team replacement preserves previous choice', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'meu-configure-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = { hardwareUdid: 'hardware', appId: 'com.example.app' };
  const options = { directory, discoverTeams: async () => [{ teamId: 'AAAAAAAAAA' }] };
  const resolve = args => resolveIOSSigning(args, options);
  const runnerPath = join(directory, 'runner');
  await mkdir(join(runnerPath, 'MEUStandaloneRunner.xcodeproj'), { recursive: true });
  await writeFile(join(runnerPath, 'MEUStandaloneRunner.xcodeproj/project.pbxproj'), 'fixture');
  const resolveDevice = async () => target.hardwareUdid;
  let fail = true;
  const build = async args => {
    assert.equal(args[args.indexOf('--runner') + 1], runnerPath);
    assert.equal(args[1], 'hardware');
    if (fail) throw new Error('No account access');
  };
  const input = { deviceId: 'core-device', appId: target.appId, runnerPath };
  await assert.rejects(configureSigning(input, { resolveDevice, resolve, build }), /No account/);
  await assert.rejects(readIOSSigning(target, options), { code: 'IOS_SIGNING_SETUP_REQUIRED' });
  fail = false;
  const verified = await configureSigning(input, { resolveDevice, resolve, build });
  assert.equal(verified.verified, true);
  fail = true;
  await assert.rejects(configureSigning({ ...input, developmentTeam: 'BBBBBBBBBB' }, { resolveDevice, resolve, build }), /No account/);
  assert.equal((await readIOSSigning(target, options)).teamId, 'AAAAAAAAAA');
  fail = false;
  await configureSigning({ ...input, developmentTeam: 'BBBBBBBBBB' }, { resolveDevice, resolve, build });
  assert.equal((await readIOSSigning(target, options)).teamId, 'BBBBBBBBBB');
});

test('skill scripts run outside the repository without npm or Host modules', async t => {
  const { cp } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const { execFileSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'meu-standalone-skill-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const scripts = join(directory, 'scripts');
  await cp('skills/to-ios-integrate/scripts', scripts, { recursive: true });
  const entry = join(scripts, 'prepare-signing.mjs');
  assert.match(execFileSync(process.execPath, [entry, '--help'], { cwd: directory, encoding: 'utf8' }), /--runner PATH/);
  const standalone = await import(pathToFileURL(entry).href);
  const discovery = await import(pathToFileURL(join(scripts, 'signing.mjs')).href);
  const runnerPath = join(directory, 'runner');
  await mkdir(join(runnerPath, 'MEUStandaloneRunner.xcodeproj'), { recursive: true });
  await writeFile(join(runnerPath, 'MEUStandaloneRunner.xcodeproj/project.pbxproj'), 'fixture');
  const configuration = join(directory, 'signing');
  const result = await standalone.configureSigning({ deviceId: 'core-device', appId: 'com.example.app', runnerPath }, {
    resolveDevice: async () => 'hardware',
    resolve: args => discovery.resolveIOSSigning(args, { directory: configuration, discoverTeams: async () => [{ teamId: 'AAAAAAAAAA' }] }),
    build: async () => {},
  });
  assert.equal(result.verified, true);
  const consumed = await readIOSSigning({ hardwareUdid: 'hardware' }, { directory: configuration });
  assert.equal(consumed.bundleId, result.bundleId);
});
