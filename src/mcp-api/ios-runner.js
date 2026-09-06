import { execFile as execFileCallback, spawn as spawnProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const RUNNER_CLI = fileURLToPath(
  new URL('../../integration/ios/bin/mobile-easy-use-ios', import.meta.url),
);
const IOS_XCTEST_DRIVER_BUNDLE_PATH = fileURLToPath(
  new URL('../../runners/ios-xctest/runtime/dist.js', import.meta.url),
);
const RUNNER_DEVICE_PORT = 8485;
const RUNNER_HOST_PORT = 28485;
const START_TIMEOUT_MS = 180_000;
const RETRY_DELAY_MS = 500;
const OUTPUT_TAIL_BYTES = 16 * 1024;
const GADGET_PROCESS_NAME = 'Gadget';
const activeDestinations = new Set();
const reservedLocalPorts = new Set();

function loadIOSXCTestDriverSource() {
  return readFile(IOS_XCTEST_DRIVER_BUNDLE_PATH, 'utf8').catch((error) => {
    throw new Error(
      `iOS XCTest driver bundle is unavailable; run \`npm run build:ios-runner\`: ${error.message}`,
      { cause: error },
    );
  });
}

export class IOSRunner {
  static async start(owner, connection, appId, options = {}) {
    const runner = new IOSRunner(owner, connection, appId, options);
    await runner.startRuntime();
    return runner;
  }

  constructor(owner, connection, appId, {
    execute = execFile,
    spawn = spawnProcess,
    runnerCli = RUNNER_CLI,
    developmentTeam = process.env.MOBILE_EASY_USE_IOS_DEVELOPMENT_TEAM,
    loadDriver = loadIOSXCTestDriverSource,
    allocatePort = reserveLocalPort,
    releasePort = releaseLocalPort,
    startTimeoutMs = START_TIMEOUT_MS,
    retryDelayMs = RETRY_DELAY_MS,
  } = {}) {
    this.owner = owner;
    this.connection = connection;
    this.appId = appId;
    this.execute = execute;
    this.spawn = spawn;
    this.runnerCli = runnerCli;
    this.developmentTeam = developmentTeam;
    this.loadDriver = loadDriver;
    this.allocatePort = allocatePort;
    this.releasePort = releasePort;
    this.startTimeoutMs = startTimeoutMs;
    this.retryDelayMs = retryDelayMs;
    this.address = null;
    this.localPort = null;
    this.destinationKey = null;
    this.process = null;
    this.proxy = null;
    this.device = null;
    this.session = null;
    this.script = null;
    this.operationTail = Promise.resolve();
    this.closePromise = null;
    this.closing = false;
  }

  async startRuntime() {
    const simulator = await findBootedSimulator(this.execute, this.connection.deviceId);
    const physical = simulator === null;
    if (physical && (typeof this.developmentTeam !== 'string' || this.developmentTeam.length === 0)) {
      throw new Error(
        'MOBILE_EASY_USE_IOS_DEVELOPMENT_TEAM is required to sign the XCTest Runner for a physical device',
      );
    }

    const physicalDevice = physical
      ? await resolvePhysicalDevice(this.execute, this.connection.deviceId)
      : null;
    const destinationId = physical ? physicalDevice.hardwareUdid : simulator.udid;
    this.destinationKey = `${physical ? 'device' : 'simulator'}:${destinationId}`;
    reserveDestination(this.destinationKey);
    try {
      this.localPort = await this.allocatePort(
        physical ? RUNNER_HOST_PORT : RUNNER_DEVICE_PORT,
      );
      const runnerPort = physical ? RUNNER_DEVICE_PORT : this.localPort;
      this.address = `127.0.0.1:${this.localPort}`;
      this.proxy = physical
        ? startChild(this.spawn, 'iproxy', [
          '-u', physicalDevice.hardwareUdid, String(this.localPort), String(runnerPort),
        ])
        : null;
      const runnerArgs = physical
        ? ['runner', '--device', destinationId, '--team', this.developmentTeam,
          '--port', String(runnerPort)]
        : ['runner', '--simulator', simulator.udid, '--port', String(runnerPort)];
      this.process = startChild(this.spawn, this.runnerCli, runnerArgs);

      await Promise.all([
        waitForChildStartup(this.proxy, 'iproxy'),
        waitForChildStartup(this.process, 'XCTest Runner'),
      ]);
      await this.connectRuntime();
      await this.status();
      this.session.detached.connect(() => {
        if (this.connection.iosRunner === this) this.connection.iosRunner = null;
        void this.close();
      });
    } catch (error) {
      await this.close();
      const diagnostics = [childTail(this.process), childTail(this.proxy)]
        .filter(Boolean)
        .join('\n');
      const suffix = diagnostics.length === 0 ? '' : `\nRunner output:\n${diagnostics}`;
      throw new Error(`Failed to start iOS XCTest Runner: ${error.message}${suffix}`);
    }
  }

  async connectRuntime() {
    const deadline = Date.now() + this.startTimeoutMs;
    let lastError = new Error('Runner did not become available');
    while (Date.now() < deadline) {
      if (this.process.exitCode !== null || this.process.signalCode !== null) {
        throw new Error(`Runner process exited with ${childExitDescription(this.process)}`);
      }
      if (this.proxy !== null
          && (this.proxy.exitCode !== null || this.proxy.signalCode !== null)) {
        throw new Error(`iproxy exited with ${childExitDescription(this.proxy)}`);
      }
      try {
        if (this.device === null) {
          this.device = await this.owner.deviceManager.addRemoteDevice(this.address);
        }
        this.session = await this.device.attach(GADGET_PROCESS_NAME);
        this.script = await this.session.createScript(await this.loadDriver(), {
          name: 'mobile-ios-xctest-driver',
        });
        await this.script.load();
        await this.script.exports.bind(this.appId);
        return;
      } catch (error) {
        lastError = error;
        await this.cleanupAttempt();
        await delay(this.retryDelayMs);
      }
    }
    throw new Error(`Timed out waiting for Runner Frida Gadget: ${lastError.message}`);
  }

  async status() {
    if (this.session?.isDetached?.() === true || this.script?.isDestroyed === true) {
      throw new Error('Runner Frida session is detached');
    }
    const status = await this.script.exports.status();
    if (status?.available !== true || status.platform !== 'ios'
        || status.driver !== 'xctest' || status.appId !== this.appId) {
      throw new Error(`XCTest driver is unavailable: ${JSON.stringify(status)}`);
    }
    return status;
  }

  perform(command) {
    if (this.closing) {
      return Promise.reject(new Error('RUNNER_UNAVAILABLE: iOS XCTest Runner is closing'));
    }
    const operation = this.operationTail.then(
      () => this.performCommand(command),
      () => this.performCommand(command),
    );
    this.operationTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  close() {
    this.closing = true;
    if (this.closePromise === null) this.closePromise = this.closeRuntime();
    return this.closePromise;
  }

  async performCommand(command) {
    await this.status();
    const result = await this.script.exports.perform(command);
    if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean') {
      throw new Error('iOS XCTest Runner returned an invalid input result');
    }
    return result;
  }

  async cleanupAttempt() {
    if (this.script !== null && this.script.isDestroyed !== true) {
      try { await this.script.unload(); } catch { }
    }
    this.script = null;
    if (this.session !== null && this.session.isDetached?.() !== true) {
      try { await this.session.detach(); } catch { }
    }
    this.session = null;
  }

  async closeRuntime() {
    try {
      await this.operationTail;
      await this.cleanupAttempt();
      if (this.device !== null && this.address !== null) {
        await removeRemoteDevice(this.owner.deviceManager, this.address);
        this.device = null;
      }
      await Promise.all([stopChild(this.process), stopChild(this.proxy)]);
    } finally {
      if (this.localPort !== null) {
        this.releasePort(this.localPort);
        this.localPort = null;
      }
      if (this.destinationKey !== null) {
        activeDestinations.delete(this.destinationKey);
        this.destinationKey = null;
      }
    }
  }
}

function reserveDestination(destinationKey) {
  if (activeDestinations.has(destinationKey)) {
    throw new Error(`An iOS XCTest Runner is already active for ${destinationKey}`);
  }
  activeDestinations.add(destinationKey);
}

async function reserveLocalPort(preferredPort) {
  if (!reservedLocalPorts.has(preferredPort) && await canListen(preferredPort)) {
    reservedLocalPorts.add(preferredPort);
    return preferredPort;
  }
  while (true) {
    const port = await availableEphemeralPort();
    if (!reservedLocalPorts.has(port)) {
      reservedLocalPorts.add(port);
      return port;
    }
  }
}

function releaseLocalPort(port) {
  reservedLocalPorts.delete(port);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

function availableEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port === null) reject(new Error('Failed to allocate a local Runner port'));
        else resolve(port);
      });
    });
  });
}

async function resolvePhysicalDevice(execute, deviceId) {
  const directory = await mkdtemp(join(tmpdir(), 'mobile-easy-use-ios-runner-'));
  const jsonPath = join(directory, 'device.json');
  const logPath = join(directory, 'device.log');
  try {
    await execute('xcrun', [
      'devicectl', 'device', 'info', 'details', '--quiet',
      '--device', deviceId, '--timeout', '10',
      '--json-output', jsonPath, '--log-output', logPath,
    ]);
    const document = JSON.parse(await readFile(jsonPath, 'utf8'));
    const hardwareUdid = document?.result?.hardwareProperties?.udid;
    if (typeof hardwareUdid !== 'string' || hardwareUdid.length === 0) {
      throw new Error('device hardware UDID is missing');
    }
    return { hardwareUdid };
  } catch (error) {
    let diagnostics = '';
    try { diagnostics = (await readFile(logPath, 'utf8')).trim(); } catch { }
    const suffix = diagnostics.length === 0 ? '' : `: ${diagnostics}`;
    throw new Error(`Failed to resolve physical iOS device "${deviceId}"${suffix}`, { cause: error });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function findBootedSimulator(execute, deviceId) {
  let stdout;
  try {
    ({ stdout } = await execute('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']));
  } catch (error) {
    throw new Error(`Failed to inspect booted iOS Simulators: ${error.message}`);
  }
  let document;
  try {
    document = JSON.parse(stdout);
  } catch {
    throw new Error('xcrun simctl returned invalid JSON');
  }
  const devices = Object.values(document.devices ?? {}).flat();
  return devices.find((device) => device?.state === 'Booted'
    && (device.udid === deviceId || device.name === deviceId)) ?? null;
}

function startChild(spawn, command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.outputTail = '';
  child.startup = new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  const collect = (chunk) => {
    child.outputTail = `${child.outputTail}${chunk.toString()}`.slice(-OUTPUT_TAIL_BYTES);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  return child;
}

async function waitForChildStartup(child, name) {
  if (child === null) return;
  await Promise.race([
    child.startup,
    delay(5_000).then(() => {
      throw new Error(`${name} did not start`);
    }),
  ]);
}

async function removeRemoteDevice(deviceManager, address) {
  try {
    await deviceManager.removeRemoteDevice(address);
  } catch (error) {
    process.stderr.write(
      `[mobile-easy-use] failed to remove Runner remote device ${address}: ${error.message}\n`,
    );
  }
}

async function stopChild(child) {
  if (child === null || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(2_000).then(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }),
  ]);
}

function childTail(child) {
  return child?.outputTail?.trim() ?? '';
}

function childExitDescription(child) {
  return child.exitCode !== null ? `code ${child.exitCode}` : `signal ${child.signalCode}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
