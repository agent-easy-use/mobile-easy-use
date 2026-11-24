import { readFile } from 'node:fs/promises';
import { command } from './command.mjs';
import { progress } from './output.mjs';

export const appId = 'com.agenteasyuse.mobileeasyuse.apidemo.ios';

export async function selectDevice(requested) {
  const { ios } = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
  const deviceId = requested ?? ios.udid;
  const list = JSON.parse(await command('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
  const device = Object.values(list.devices).flat().find(d => d.isAvailable && d.udid === deviceId);
  if (!device) throw new Error(`iOS simulator ${deviceId} is unavailable; check config.json or --device`);
  if (device.state === 'Shutdown') {
    progress(`Starting ${device.name} (${deviceId})...`);
    await command('xcrun', ['simctl', 'boot', deviceId]);
  }
  progress(`Waiting for ${device.name} to finish booting...`);
  await command('xcrun', ['simctl', 'bootstatus', deviceId, '-b'], { timeout: 180000 });
  return deviceId;
}

export async function prepareApp(deviceId, reuseApp, artifact) {
  await command('npm', ['run', 'build:ios-runner']);
  if (!reuseApp) {
    await command('xcrun', ['simctl', 'install', deviceId, artifact]);
  }
  // The production runtime loader launches the App when connect runs.
}

export function readSystem(deviceId) {
  return command('xcrun', ['simctl', 'getenv', deviceId, 'SIMULATOR_RUNTIME_VERSION']);
}

export function prepareConnection() {
  return { port: 8484 };
}

// Restore foreground after a lifecycle fixture deliberately backgrounds the App.
// simctl launch preserves an already-running process; the shell also checks PID.
export function activateApp(deviceId) {
  return command('xcrun', ['simctl', 'launch', deviceId, appId]);
}
