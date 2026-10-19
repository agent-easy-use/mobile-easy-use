import { closeIOSDebugger } from '../ios/debugger/session.js';

export const GADGET_PROCESS_NAME = 'Gadget';

export function connectionStatus(owner) {
  const connection = owner.currentConnection;
  if (connection === null) {
    return { connected: false, state: owner.state };
  }
  return {
    connected: true,
    state: owner.state,
    target: {
      platform: connection.platform,
      deviceId: connection.deviceId,
      appId: connection.appId,
      runtimePort: connection.runtimePort,
    },
    ip: connection.ip,
    port: connection.port,
    fridaTarget: GADGET_PROCESS_NAME,
    runtime: connection.runtimeStatus,
    compatibility: connection.compatibility,
    ...(connection.compatibilityWarning === null ? {} : {
      compatibilityWarning: connection.compatibilityWarning,
    }),
  };
}

export function handleDetached(owner, connection, reason, crash) {
  if (owner.currentConnection !== connection) {
    return;
  }
  owner.currentConnection = null;
  owner.state = 'disconnected';
  void closeConnectionRunner(connection);
  void closeIOSDebugger(connection).catch(error => {
    process.stderr.write(`[mobile-easy-use] debugger cleanup failed: ${error.message}\n`);
  });
  void removeRemoteDevice(owner.deviceManager, connection.address);
  const crashSummary = crash === null ? '' : ` crash=${crash.summary ?? 'unknown'}`;
  process.stderr.write(
    `[mobile-easy-use] runtime session detached: reason=${reason}${crashSummary}\n`,
  );
}

export async function closeConnection(owner, connection) {
  // A stopped iOS process cannot serve Frida RPC. Close LLDB first, then dispose the SDK.
  if (connection.platform === 'ios') {
    try { await closeIOSDebugger(connection); } catch (error) {
      process.stderr.write(`[mobile-easy-use] debugger cleanup failed: ${error.message}\n`);
    }
  }
  // Dispose SDK state before unloading (including native callbacks on Android).
  // Android must drain native callbacks before unloading. iOS cleanup is best effort.
  if (
    connection.sdkScript.isDestroyed !== true
    && ['android', 'ios'].includes(connection.platform)
    && typeof connection.sdkScript.exports.dispose === 'function'
  ) {
    try { await connection.sdkScript.exports.dispose(); } catch (error) {
      if (connection.platform !== 'ios') throw error;
      process.stderr.write(`[mobile-easy-use] SDK disposal failed: ${error.message}\n`);
    }
  }
  if (owner.currentConnection === connection) {
    owner.currentConnection = null;
    owner.state = 'disconnected';
  }
  await closeConnectionRunner(connection);
  if (connection.sdkScript.isDestroyed !== true) {
    try {
      await connection.sdkScript.unload();
    } catch (error) {
      process.stderr.write(
        `[mobile-easy-use] failed to unload SDK Script: ${error.message}\n`,
      );
    }
  }
  if (connection.session.isDetached?.() !== true) {
    try {
      await connection.session.detach();
    } catch (error) {
      process.stderr.write(
        `[mobile-easy-use] failed to detach runtime session: ${error.message}\n`,
      );
    }
  }
  await removeRemoteDevice(owner.deviceManager, connection.address);
}

export async function removeRemoteDevice(deviceManager, address) {
  try {
    await deviceManager.removeRemoteDevice(address);
  } catch (error) {
    process.stderr.write(
      `[mobile-easy-use] failed to remove remote device ${address}: ${error.message}\n`,
    );
  }
}

export async function closeConnectionRunner(connection) {
  const runner = connection?.iosRunner;
  if (runner === null || runner === undefined) return;
  connection.iosRunner = null;
  try {
    await runner.close();
  } catch (error) {
    process.stderr.write(`[mobile-easy-use] failed to close iOS Runner: ${error.message}\n`);
  }
}
