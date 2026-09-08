import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const TEAM = /^[A-Z0-9]{10}$/;
const BUNDLE = /^com\.mobileeasyuse\.runner\.t[a-z0-9]{10}\.r[a-f0-9]{16}$/;
const COMMAND_OPTIONS = { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15_000 };

export class IOSSigningError extends Error {
  constructor(code, message, teams = undefined) {
    super(message);
    this.code = code;
    if (teams !== undefined) this.developmentTeams = teams.map(({ teamId, name }) => ({ teamId, name }));
  }
}

export function validateDevelopmentTeam(value) {
  if (value !== undefined && (typeof value !== 'string' || !TEAM.test(value))) {
    throw new IOSSigningError('IOS_SIGNING_INVALID_TEAM', 'developmentTeam must be a 10-character uppercase Apple Team ID; it is only supported for iOS physical devices.');
  }
}

export function signingFailureFromOutput(output) {
  if (/No Accounts:|Add a new account in Accounts settings|Your session has expired|Unable to log in with account/i.test(output)) {
    return new IOSSigningError('IOS_SIGNING_SETUP_REQUIRED', 'Xcode could not use an Apple Account to sign the Runner. Open Xcode > Settings > Apple Accounts and sign in to, or refresh, the account you use for iOS development. Then rerun signing repair in to-ios-integrate. If that account cannot use the previously selected signing team, select an available team during repair.');
  }
  if (/errSecInteractionNotAllowed|User interaction is not allowed|errSecInternalComponent/i.test(output)) {
    return new IOSSigningError('IOS_SIGNING_KEYCHAIN_ERROR', 'Xcode could not access the signing key. Unlock the signing Keychain and allow codesign access, then rerun the to-ios-integrate signing repair path.');
  }
  const lines = output.split(/\r?\n/).filter(line => /error:.*(?:provision|signing|certificate|register|App ID|development team|No profiles)/i.test(line));
  if (lines.length > 0) {
    return new IOSSigningError('IOS_SIGNING_PROVISIONING_FAILED', `Xcode could not sign the Runner for the selected team. Use the to-ios-integrate signing repair path to check account permissions, device registration, and provisioning: ${lines.slice(0, 3).join('\n')}`);
  }
  return null;
}

// A code-signing identity includes the private key. Inspect only public certificates,
// matching fingerprints against security's valid identity list; never export keys.
export async function discoverSigningTeams({ execute = execFile } = {}) {
  let identities;
  let certificates;
  try {
    ({ stdout: identities } = await execute('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], COMMAND_OPTIONS));
    if (!/\b[0-9A-Fa-f]{40}\b/.test(identities)) return [];
    ({ stdout: certificates } = await execute('/usr/bin/security', ['find-certificate', '-a', '-p'], COMMAND_OPTIONS));
  } catch (error) {
    throw new IOSSigningError('IOS_SIGNING_KEYCHAIN_ERROR', `Cannot inspect development signing identities. Check Keychain access: ${error.message}`);
  }
  return teamsFromCertificates(identities, certificates);
}

export function teamsFromCertificates(identities, certificates, now = Date.now()) {
  const valid = new Set([...identities.matchAll(/\b[0-9A-Fa-f]{40}\b/g)].map(match => match[0].toUpperCase()));
  const teams = new Map();
  for (const pem of certificates.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []) {
    let certificate;
    try { certificate = new X509Certificate(pem); } catch { continue; }
    const fingerprint = certificate.fingerprint.replaceAll(':', '').toUpperCase();
    if (!valid.has(fingerprint) || Date.parse(certificate.validTo) <= now || Date.parse(certificate.validFrom) > now) continue;
    const subject = certificate.subject;
    const commonName = subject.match(/(?:^|\n)CN=([^\n]+)/)?.[1] ?? '';
    if (!/^(Apple Development|iPhone Developer):/.test(commonName)) continue;
    const teamId = subject.match(/(?:^|\n)OU=([^\n]+)/)?.[1];
    if (!TEAM.test(teamId ?? '')) continue;
    const name = subject.match(/(?:^|\n)O=([^\n]+)/)?.[1] || teamId;
    const team = teams.get(teamId) ?? { teamId, name, fingerprints: [] };
    team.fingerprints.push(fingerprint);
    teams.set(teamId, team);
  }
  return [...teams.values()].sort((a, b) => a.teamId.localeCompare(b.teamId));
}

const PROFILE_SUMMARY = `import plistlib,json,base64,sys
p=plistlib.load(open(sys.argv[1],'rb'))
e=p.get('Entitlements',{})
print(json.dumps({'teamIds':p.get('TeamIdentifier',[]),'prefixes':p.get('ApplicationIdentifierPrefix',[]),'applicationIdentifier':e.get('application-identifier',''),'development':e.get('get-task-allow') is True,'devices':p.get('ProvisionedDevices',[]),'expires':p['ExpirationDate'].isoformat()+'Z' if p.get('ExpirationDate') else None,'certificates':[base64.b64encode(c).decode() for c in p.get('DeveloperCertificates',[])]}))`;

export async function discoverAppTeams({ appId, hardwareUdid, teams, execute = execFile, home = homedir() }) {
  const matches = new Set();
  const roots = [join(home, 'Library/Developer/Xcode/UserData/Provisioning Profiles'), join(home, 'Library/MobileDevice/Provisioning Profiles')];
  const directory = await mkdtemp(join(tmpdir(), 'meu-signing-'));
  try {
    for (const root of roots) {
      let files;
      try { files = await readdir(root); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      for (const file of files.filter(name => name.endsWith('.mobileprovision'))) {
        const decoded = join(directory, 'profile.plist');
        let profile;
        try {
          await execute('/usr/bin/security', ['cms', '-D', '-i', join(root, file), '-o', decoded], COMMAND_OPTIONS);
          const { stdout } = await execute('python3', ['-c', PROFILE_SUMMARY, decoded], COMMAND_OPTIONS);
          profile = JSON.parse(stdout);
        } catch { continue; } // An unrelated expired or malformed profile is not a candidate.
        for (const team of matchingAppTeams(profile, { appId, hardwareUdid, teams })) matches.add(team);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return [...matches];
}

export function matchingAppTeams(profile, { appId, hardwareUdid, teams, now = Date.now() }) {
  if (!profile.development || !(Date.parse(profile.expires) > now) || !profile.devices?.includes(hardwareUdid)) return [];
  // Exact App ID only. Wildcards do not identify the target App's preferred team.
  if (!profile.prefixes?.some(prefix => profile.applicationIdentifier === `${prefix}.${appId}`)) return [];
  const fingerprints = new Set();
  for (const data of profile.certificates ?? []) {
    try { fingerprints.add(new X509Certificate(Buffer.from(data, 'base64')).fingerprint.replaceAll(':', '').toUpperCase()); } catch { }
  }
  return teams.filter(team => profile.teamIds?.includes(team.teamId)
    && team.fingerprints.some(value => fingerprints.has(value))).map(team => team.teamId);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new IOSSigningError('IOS_SIGNING_CONFIG_ERROR', `Cannot read signing configuration at ${path}: ${error.message}`);
  }
}

export async function resolveIOSSigning({ hardwareUdid, appId, developmentTeam, projectTeam }, {
  directory = join(process.env.MEU_HOME || join(homedir(), '.meu'), 'ios/signing'),
  discoverTeams = discoverSigningTeams,
  discoverProfileTeams = discoverAppTeams,
} = {}) {
  validateDevelopmentTeam(developmentTeam);
  const explicit = developmentTeam;
  const deviceKey = createHash('sha256').update(hardwareUdid).digest('hex');
  const devicePath = join(directory, 'devices', `${deviceKey}.json`);
  const saved = explicit === undefined ? await readJson(devicePath) : null;
  if (saved !== null && (!TEAM.test(saved.teamId ?? '') || !BUNDLE.test(saved.bundleId ?? ''))) {
    throw new IOSSigningError('IOS_SIGNING_CONFIG_ERROR', `Invalid saved signing configuration at ${devicePath}.`);
  }
  let teamId = explicit ?? saved?.teamId;
  let source = explicit !== undefined ? 'explicit' : 'saved';
  if (teamId === undefined) {
    const teams = await discoverTeams();
    if (teams.some(team => team.teamId === projectTeam)) {
      teamId = projectTeam;
      source = 'project';
    } else if (teams.length === 0) {
      throw new IOSSigningError('IOS_SIGNING_SETUP_REQUIRED', 'No usable Apple Development signing identity was found. Sign in to Xcode > Settings > Apple Accounts and initialize development signing, then rerun the to-ios-integrate signing repair path. In to-ios-integrate, select a team and use --team to let Xcode provision it.');
    }
    else if (teams.length === 1) {
      teamId = teams[0].teamId;
      source = 'keychain';
    } else {
      const matching = await discoverProfileTeams({ appId, hardwareUdid, teams });
      const candidates = teams.filter(team => matching.includes(team.teamId));
      if (candidates.length !== 1) {
        throw new IOSSigningError('IOS_SIGNING_TEAM_REQUIRED', 'Multiple development teams are available. Select a team in to-ios-integrate and rerun the signing command with --team; the choice is saved after signing verification.', teams);
      }
      teamId = candidates[0].teamId;
      source = 'app-profile';
    }
  }
  const teamDirectory = join(directory, 'teams');
  await mkdir(teamDirectory, { recursive: true });
  const teamPath = join(teamDirectory, `${teamId}.json`);
  const teamTemporary = `${teamPath}.${randomUUID()}.tmp`;
  // Reserve a stable bundle ID even if provisioning fails; retries must not register new IDs.
  try {
    const bundleId = saved?.teamId === teamId ? saved.bundleId
      : `com.mobileeasyuse.runner.t${teamId.toLowerCase()}.r${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    await writeFile(teamTemporary, JSON.stringify({ teamId, bundleId }) + '\n', { flag: 'wx', mode: 0o600 });
    await link(teamTemporary, teamPath);
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { await rm(teamTemporary, { force: true }); }
  const record = await readJson(teamPath);
  if (record?.teamId !== teamId || !BUNDLE.test(record.bundleId ?? '')) {
    throw new IOSSigningError('IOS_SIGNING_CONFIG_ERROR', `Invalid team signing configuration at ${teamPath}.`);
  }
  return {
    ...record,
    source,
    async remember() {
      await mkdir(join(directory, 'devices'), { recursive: true });
      const temporary = `${devicePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(record) + '\n', { mode: 0o600 });
        await rename(temporary, devicePath);
      } finally { await rm(temporary, { force: true }); }
    },
  };
}
