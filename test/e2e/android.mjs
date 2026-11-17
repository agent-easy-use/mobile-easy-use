import { spawn } from 'node:child_process';
import { readFile, open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { command } from './command.mjs';
import { progress } from './output.mjs';

const adb = resolve(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? `${homedir()}/Library/Android/sdk`, 'platform-tools/adb');
export const appId = 'com.agenteasyuse.mobileeasyuse.apidemo';

export async function selectDevice(requested, output) {
  const { android: { avd, port } } = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
  if (!avd || !Number.isInteger(port) || port < 5554 || port > 5682 || port % 2 !== 0) {
    throw new Error('config.json requires android.avd and an even android.port between 5554 and 5682');
  }
  const configured = `emulator-${port}`;
  const deviceId = requested ?? configured;
  if (!/^emulator-\d+$/.test(deviceId)) throw new Error('--device must identify an Android emulator');
  const devices = await command(adb, ['devices']);
  const present = devices.split('\n').some(line => line.split(/\s+/)[0] === deviceId);
  let child, launchError;
  if (!present) {
    if (deviceId !== configured) throw new Error(`${deviceId} is not running; only configured ${configured} (${avd}) can be started automatically`);
    const emulator = resolve(adb, '../../emulator/emulator');
    const avds = (await command(emulator, ['-list-avds'])).split('\n');
    if (!avds.includes(avd)) throw new Error(`AVD ${avd} is not installed. Available: ${avds.join(', ')}`);
    const logPath = resolve(output, 'emulator.log');
    const log = await open(logPath, 'a');
    progress(`Starting ${avd} on ${deviceId}; log: ${logPath}`);
    try {
      child = spawn(emulator, ['-avd', avd, '-port', String(port)], {
        detached: true, stdio: ['ignore', log.fd, log.fd],
      });
      child.on('error', error => { launchError = error; });
      child.unref();
    } finally { await log.close(); }
  }
  progress(`Waiting for ${deviceId} to finish booting...`);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`Emulator exited before booting; see ${resolve(output, 'emulator.log')}`);
    }
    let booted = false;
    try {
      booted = await command(adb, ['-s', deviceId, 'shell', 'getprop', 'sys.boot_completed'], { timeout: 5000 }) === '1';
    } catch (_) { /* adb may report offline while the emulator boots. */ }
    if (booted) {
      if (!requested || child) {
        const actual = (await command(adb, ['-s', deviceId, 'emu', 'avd', 'name'])).split('\n')[0].trim();
        if (actual !== avd) throw new Error(`${deviceId} runs ${actual}, but config.json specifies ${avd}; use another port or explicit --device`);
      }
      return deviceId;
    }
    await delay(1000);
  }
  throw new Error(`${deviceId} did not finish booting within 180 seconds`);
}

export async function prepareApp(deviceId, reuseApp, artifact) {
  if (!reuseApp) {
    await command(adb, ['-s', deviceId, 'install', '-r', artifact]);
  }
  await command(adb, ['-s', deviceId, 'shell', 'am', 'force-stop', appId]);
  await command(adb, ['-s', deviceId, 'shell', 'am', 'start', '-W', '-n', `${appId}/.ui.MainActivity`]);
}

export function readSystem(deviceId) {
  return command(adb, ['-s', deviceId, 'shell', 'getprop', 'ro.build.version.release']);
}

export async function prepareConnection(deviceId) {
  const forwarding = await command(adb, ['-s', deviceId, 'forward', 'tcp:0', 'tcp:8484']);
  return {
    port: Number(forwarding),
    cleanup: () => command(adb, ['-s', deviceId, 'forward', '--remove', `tcp:${forwarding}`]),
  };
}
