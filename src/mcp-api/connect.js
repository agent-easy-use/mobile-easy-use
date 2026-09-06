import { isIP } from 'node:net';
import { PRESETS_MODULE_PATH } from '../sdk-source.js';
import { handleControllerMessage } from './controller.js';
import { IOSRunner } from './ios-runner.js';
import {
  closeConnection,
  closeConnectionRunner,
  connectionStatus,
  GADGET_PROCESS_NAME,
  handleDetached,
  removeRemoteDevice,
} from './utils.js';

export async function connect(owner, {
  platform,
  deviceId,
  appId,
  runtimePort,
  ip,
  port,
} = {}) {
  validatePlatform(platform);
  validateTarget(deviceId, appId, runtimePort);
  validateIp(ip);
  validatePort(port);

  const targetKey = JSON.stringify([deviceId, appId]);
  const address = `${ip}:${port}`;
  if (owner.state === 'connected' && owner.currentConnection !== null) {
    const connection = owner.currentConnection;
    if (connection.targetKey === targetKey && isConnectionUsable(connection)) {
      if (connection.platform !== platform) {
        throw new Error(
          `MobileEasyUse instance for deviceId "${deviceId}" and appId "${appId}" `
          + `already uses platform "${connection.platform}"`,
        );
      }
      try {
        await validateRuntime(connection.sdkScript, {
          platform,
          appId,
          runtimePort: connection.runtimePort,
        });
        return connectionStatus(owner);
      } catch (error) {
        await closeConnection(owner, connection);
        throw error;
      }
    }
    if (connection.activeCall !== null) {
      throw new Error(
        'Cannot switch the MobileEasyUse target while an operation is running',
      );
    }
    await closeConnection(owner, connection);
  }
  if (owner.state !== 'disconnected') {
    throw new Error(`MobileEasyUse connection is already ${owner.state}`);
  }

  owner.state = 'connecting';
  let device = null;
  let session = null;
  let sdkScript = null;
  let connection = null;
  try {
    device = await owner.deviceManager.addRemoteDevice(address);
    session = await device.attach(GADGET_PROCESS_NAME);
    connection = {
      connectionId: owner.createConnectionId(),
      targetKey,
      platform,
      deviceId,
      appId,
      runtimePort,
      ip,
      port,
      address,
      device,
      session,
      sdkScript: null,
      activeCall: null,
      iosRunner: null,
    };
    const sdkSource = await owner.loadSdk(platform);
    sdkScript = await session.createScript(sdkSource, { name: `mobile-${platform}-sdk` });
    connection.sdkScript = sdkScript;
    sdkScript.logHandler = (_level, text) => {
      connection.activeCall?.collectLog(text);
    };
    sdkScript.message?.connect((message, data) => {
      return handleControllerMessage(sdkScript, message, data, owner, connection).catch(() => {
        // The operation will surface a Controller response timeout.
      });
    });
    await sdkScript.load();
    await validateRuntime(sdkScript, { platform, appId, runtimePort });
    const presetsSource = await owner.loadPresets();
    if (presetsSource !== null) {
      await sdkScript.exports.loadPresetBundle(PRESETS_MODULE_PATH, presetsSource);
    }
    if (platform === 'ios') {
      connection.iosRunner = await IOSRunner.start(owner, connection, appId);
    }
    owner.currentConnection = connection;
    owner.state = 'connected';
    session.detached.connect((reason, crash) => {
      handleDetached(owner, connection, reason, crash);
    });
    return connectionStatus(owner);
  } catch (error) {
    owner.currentConnection = null;
    owner.state = 'disconnected';
    await closeConnectionRunner(connection);
    if (sdkScript !== null && sdkScript.isDestroyed !== true) {
      try {
        await sdkScript.unload();
      } catch {
        // Preserve the original connection/SDK error.
      }
    }
    if (session !== null && session.isDetached?.() !== true) {
      try {
        await session.detach();
      } catch {
        // Preserve the original connection/SDK error.
      }
    }
    if (device !== null) {
      await removeRemoteDevice(owner.deviceManager, address);
    }
    throw new Error(`Failed to connect to MobileEasyUse at ${address}: ${error.message}`);
  }
}

async function validateRuntime(sdkScript, { platform, appId, runtimePort }) {
  const runtimeStatus = await sdkScript.exports.runtimeStatus();
  if (runtimeStatus?.platform !== platform || runtimeStatus.available !== true) {
    throw new Error(
      `SDK runtime is unavailable after initialization: ${JSON.stringify(runtimeStatus)}`,
    );
  }
  if (runtimeStatus.appId !== appId) {
    const actualAppId = typeof runtimeStatus.appId === 'string'
      ? `"${runtimeStatus.appId}"`
      : 'unknown';
    throw new Error(
      `Device runtime port ${runtimePort} is already occupied by another App: `
      + `expected appId "${appId}", connected appId ${actualAppId}`,
    );
  }
  return runtimeStatus;
}

function isConnectionUsable(connection) {
  return connection.session.isDetached?.() !== true
    && connection.sdkScript.isDestroyed !== true
    && (connection.platform !== 'ios'
      || (connection.iosRunner !== null && connection.iosRunner.closing !== true));
}

function validateIp(ip) {
  if (typeof ip !== 'string' || isIP(ip) !== 4) {
    throw new Error('ip must be a valid IPv4 address');
  }
  if (ip !== '127.0.0.1') {
    throw new Error('ip must be 127.0.0.1; remote endpoints are not supported');
  }
}

function validatePlatform(platform) {
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('platform must be android or ios');
  }
}

function validateTarget(deviceId, appId, runtimePort) {
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('deviceId must be a non-empty string');
  }
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error('appId must be a non-empty string');
  }
  validatePort(runtimePort);
}

function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('port must be an integer between 1 and 65535');
  }
}
