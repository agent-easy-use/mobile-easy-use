import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discoverAppTeams, discoverSigningTeams, matchingAppTeams, resolveIOSSigning, signingFailureFromOutput, teamsFromCertificates, validateDevelopmentTeam } from '../skills/to-ios-integrate/scripts/signing.mjs';
import { readIOSSigning } from '../src/mcp-api/ios-signing.js';
import { prepareIOSRunner } from '../src/mcp-api/ios-runner.js';

const teamA = { teamId: 'AAAAAAAAAA', name: 'Team A', fingerprints: ['A'] };
const teamB = { teamId: 'BBBBBBBBBB', name: 'Team B', fingerprints: ['B'] };
const target = { hardwareUdid: 'device-one', appId: 'com.example.app' };
async function fixture(t, teams = [teamA], matches = []) {
  const directory = await mkdtemp(join(tmpdir(), 'meu-signing-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, discoverTeams: async () => teams, discoverProfileTeams: async () => matches };
}

test('single team is automatic; a bundle stays stable before and after successful signing verification', async t => {
  const options = await fixture(t);
  const first = await resolveIOSSigning(target, options);
  assert.equal(first.teamId, teamA.teamId);
  assert.equal(first.source, 'keychain');
  await assert.rejects(readdir(join(options.directory, 'devices')), { code: 'ENOENT' });
  const retry = await resolveIOSSigning(target, options);
  assert.equal(retry.bundleId, first.bundleId);
  await first.remember();
  const saved = await resolveIOSSigning(target, { ...options, discoverTeams: () => { throw new Error('must reuse'); } });
  assert.equal(saved.source, 'saved');
  assert.equal(saved.bundleId, first.bundleId);
});

test('concurrent resolution reserves one complete bundle configuration per team', async t => {
  const options = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => resolveIOSSigning({ ...target, hardwareUdid: `device-${i}` }, options)));
  assert.equal(new Set(results.map(r => r.bundleId)).size, 1);
  await Promise.all(results.map(r => r.remember()));
  assert.equal((await readdir(join(options.directory, 'devices'))).length, 8);
});

test('multiple teams use a unique exact App profile hint', async t => {
  const signing = await resolveIOSSigning(target, await fixture(t, [teamA, teamB], [teamB.teamId]));
  assert.equal(signing.teamId, teamB.teamId);
  assert.equal(signing.source, 'app-profile');
});

test('ambiguous teams return public candidates and do not reserve or remember a choice', async t => {
  const options = await fixture(t, [teamA, teamB]);
  await assert.rejects(resolveIOSSigning(target, options), error => {
    assert.equal(error.code, 'IOS_SIGNING_TEAM_REQUIRED');
    assert.deepEqual(error.developmentTeams, [{ teamId: teamA.teamId, name: 'Team A' }, { teamId: teamB.teamId, name: 'Team B' }]);
    return true;
  });
  assert.deepEqual(await readdir(options.directory), []);
});

test('conflicting exact profiles remain ambiguous', async t => {
  await assert.rejects(resolveIOSSigning(target, await fixture(t, [teamA, teamB], [teamA.teamId, teamB.teamId])), { code: 'IOS_SIGNING_TEAM_REQUIRED' });
});

test('explicit iOS team overrides remembered choice without requiring an existing certificate', async t => {
  const options = await fixture(t, []);
  const explicit = await resolveIOSSigning({ ...target, developmentTeam: teamA.teamId }, options);
  assert.equal(explicit.teamId, teamA.teamId);
  await explicit.remember();
  const override = await resolveIOSSigning({ ...target, developmentTeam: teamB.teamId }, options);
  assert.equal(override.teamId, teamB.teamId);
  assert.notEqual(override.bundleId, explicit.bundleId);
  const previous = await resolveIOSSigning(target, options);
  assert.equal(previous.teamId, teamA.teamId); // Failed/new attempts do not overwrite success.
});

test('no signing identity produces an actionable setup error', async t => {
  await assert.rejects(resolveIOSSigning(target, await fixture(t, [])), { code: 'IOS_SIGNING_SETUP_REQUIRED' });
  for (const invalid of ['', null, 1, 'a'.repeat(10), '../bad', 'SHORT']) {
    assert.throws(() => validateDevelopmentTeam(invalid), { code: 'IOS_SIGNING_INVALID_TEAM' });
  }
});

test('empty identity list requires setup; a Keychain command failure remains distinguishable', async () => {
  let calls = 0;
  assert.deepEqual(await discoverSigningTeams({ execute: async () => { calls++; return { stdout: '0 valid identities found' }; } }), []);
  assert.equal(calls, 1);
  await assert.rejects(discoverSigningTeams({ execute: async () => { throw new Error('permission denied'); } }), { code: 'IOS_SIGNING_KEYCHAIN_ERROR' });
});

test('Xcode signing failures identify the prerequisite without treating unrelated build errors as signing errors', () => {
  assert.equal(signingFailureFromOutput('error: No Accounts: Add a new account in Accounts settings.\nerror: No profiles for Runner').code, 'IOS_SIGNING_SETUP_REQUIRED');
  assert.equal(signingFailureFromOutput('codesign: errSecInternalComponent').code, 'IOS_SIGNING_KEYCHAIN_ERROR');
  assert.equal(signingFailureFromOutput('Runner.xcodeproj: error: No profiles for Runner were found').code, 'IOS_SIGNING_PROVISIONING_FAILED');
  assert.equal(signingFailureFromOutput('error: Swift compilation failed'), null);
});

test('simulator preparation skips all signing', async () => {
  const options = {
    execute: async () => ({ stdout: JSON.stringify({ devices: { ios: [{ state: 'Booted', udid: 'sim-1' }] } }) }),
    readSigning: () => { throw new Error('must not sign simulator'); },
  };
  assert.deepEqual(await prepareIOSRunner({ deviceId: 'sim-1', appId: target.appId }, options), { physical: false, destinationId: 'sim-1', signing: null });
});

test('certificate matching uses the identity fingerprint and OU, not the CN account identifier', async t => {
  const { directory } = await fixture(t);
  const path = join(directory, 'certificate.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'test.key'), '-out', path,
    '-days', '1', '-subj', '/CN=Apple Development: Test (CCCCCCCCCC)/OU=AAAAAAAAAA/O=Team A'], { stdio: 'ignore' });
  const pem = await readFile(path, 'utf8');
  const certificate = new X509Certificate(pem);
  const fingerprint = certificate.fingerprint.replaceAll(':', '');
  const identities = `1) ${fingerprint} "Apple Development: Test (CCCCCCCCCC)"`;
  const teams = teamsFromCertificates(identities, pem + pem);
  assert.equal(teams.length, 1);
  assert.equal(teams[0].teamId, teamA.teamId);
  assert.deepEqual(teamsFromCertificates('', pem), []); // Certificate without private-key identity.
  assert.deepEqual(teamsFromCertificates(identities, pem, Date.parse(certificate.validTo) + 1), []);
  const profile = {
    teamIds: [teamA.teamId], prefixes: ['LEGACYPREF'], applicationIdentifier: `LEGACYPREF.${target.appId}`,
    development: true, devices: [target.hardwareUdid], expires: new Date(Date.now() + 60_000).toISOString(), certificates: [certificate.raw.toString('base64')],
  };
  assert.deepEqual(matchingAppTeams(profile, { ...target, teams }), [teamA.teamId]);
  for (const change of [{ development: false }, { devices: [] }, { expires: '2000-01-01' }, { expires: null }, { applicationIdentifier: 'LEGACYPREF.*' }, { teamIds: [teamB.teamId] }, { certificates: [] }]) {
    assert.deepEqual(matchingAppTeams({ ...profile, ...change }, { ...target, teams }), []);
  }
  // Exercise profile directory discovery with mocked CMS/plist command results.
  const profileRoot = join(directory, 'Library/Developer/Xcode/UserData/Provisioning Profiles');
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(profileRoot, { recursive: true });
  await writeFile(join(profileRoot, 'test.mobileprovision'), 'fixture');
  const matches = await discoverAppTeams({ ...target, teams, home: directory, execute: async (command, args) => {
    if (command === '/usr/bin/security') return { stdout: '' };
    assert.equal(command, 'python3');
    return { stdout: JSON.stringify(profile) };
  } });
  assert.deepEqual(matches, [teamA.teamId]);
});


test('runtime requires saved configuration and never discovers teams', async t => {
  const options = await fixture(t, [teamA]);
  const setup = await resolveIOSSigning(target, options);
  options.discoverTeams = () => { throw new Error('runtime must not discover'); };
  await assert.rejects(readIOSSigning(target, options), { code: 'IOS_SIGNING_SETUP_REQUIRED' });
  await setup.remember();
  const saved = await readIOSSigning(target, options);
  assert.equal(saved.teamId, teamA.teamId);
  assert.equal(saved.remember, undefined);
});

test('project hint resolves ambiguity but saved configuration takes precedence', async t => {
  const options = await fixture(t, [teamA, teamB]);
  const initial = await resolveIOSSigning({ ...target, projectTeam: teamB.teamId }, options);
  assert.equal(initial.source, 'project');
  await initial.remember();
  const repair = await resolveIOSSigning({ ...target, projectTeam: teamA.teamId }, options);
  assert.equal(repair.teamId, teamB.teamId);
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
