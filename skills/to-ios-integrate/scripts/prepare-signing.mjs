#!/usr/bin/env node
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IOSSigningError, resolveIOSSigning, signingFailureFromOutput, validateDevelopmentTeam } from './signing.mjs';

const execFile = promisify(execFileCallback);
const command = fileURLToPath(new URL('./build-runner.sh', import.meta.url));

export async function resolvePhysicalDevice(deviceId, execute = execFile) {
  const directory = await mkdtemp(join(tmpdir(), 'meu-signing-device-'));
  const jsonPath = join(directory, 'device.json');
  try {
    await execute('xcrun', ['devicectl', 'device', 'info', 'details', '--quiet', '--device', deviceId,
      '--timeout', '10', '--json-output', jsonPath], { timeout: 15_000 });
    const document = JSON.parse(await readFile(jsonPath, 'utf8'));
    const hardwareUdid = document?.result?.hardwareProperties?.udid;
    if (typeof hardwareUdid !== 'string' || !hardwareUdid) throw new Error('Device hardware UDID is missing');
    return hardwareUdid;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function buildRunner(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [command, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      process.stderr.write(chunk);
      tail = (tail + chunk.toString()).slice(-65536);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(signingFailureFromOutput(tail) ?? new Error(`Runner preparation failed (${signal ?? code}). See build output.`));
    });
  });
}

export async function configureSigning({ deviceId, appId, runnerPath, developmentTeam, projectTeam }, {
  resolveDevice = resolvePhysicalDevice, resolve = resolveIOSSigning, build = buildRunner,
} = {}) {
  if (!deviceId || !appId || !runnerPath) throw new Error('--device, --app and --runner are required');
  validateDevelopmentTeam(developmentTeam);
  validateDevelopmentTeam(projectTeam);
  runnerPath = resolvePath(runnerPath);
  await access(join(runnerPath, 'MEUStandaloneRunner.xcodeproj/project.pbxproj'));
  const hardwareUdid = await resolveDevice(deviceId);
  const signing = await resolve({ hardwareUdid, appId, developmentTeam, projectTeam });
  await build(['--device', hardwareUdid, '--team', signing.teamId, '--bundle-id', signing.bundleId, '--runner', runnerPath]);
  await signing.remember();
  return { verified: true, deviceId, hardwareUdid, teamId: signing.teamId, bundleId: signing.bundleId, source: signing.source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: {
      device: { type: 'string' }, app: { type: 'string' }, runner: { type: 'string' },
      team: { type: 'string' }, 'project-team': { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) {
      process.stdout.write('Usage: node prepare-signing.mjs --device COREDEVICE_ID --app BUNDLE_ID --runner PATH [--project-team TEAM_ID] [--team TEAM_ID]\n');
    } else {
      if (process.platform !== 'darwin') throw new Error('Runner signing requires macOS and Xcode.');
      const result = await configureSigning({ deviceId: values.device, appId: values.app, runnerPath: values.runner,
        developmentTeam: values.team, projectTeam: values['project-team'] });
      process.stdout.write(JSON.stringify(result) + '\n');
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error.message, ...(error instanceof IOSSigningError ? { code: error.code, developmentTeams: error.developmentTeams } : {}) }) + '\n');
    process.exitCode = 1;
  }
}
