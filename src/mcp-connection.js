import { randomUUID } from 'node:crypto';
import { GadgetConnection } from './mcp-api/api.js';

export class ConnectionInstance extends GadgetConnection {
  constructor(deviceManager, { deviceId, appId, platform }, {
    connectionId = randomUUID(),
    logger,
    gadgetConnectionOptions = {},
  } = {}) {
    super(deviceManager, {
      ...gadgetConnectionOptions,
      createConnectionId: () => connectionId,
    });
    this.deviceId = deviceId;
    this.appId = appId;
    this.platform = platform;
    this.connectionId = connectionId;
    this.logger = logger;
  }

  async execute(message, operation) {
    this.logger.request(message, this.connectionId);
    const response = await operation(this);
    if (response !== null) {
      this.logger.response(response, this.connectionId);
    }
    return response;
  }

  get address() {
    return this.currentConnection?.address ?? null;
  }

  get isUsable() {
    const connection = this.currentConnection;
    return this.state === 'connected'
      && connection !== null
      && connection.session.isDetached?.() !== true
      && connection.sdkScript.isDestroyed !== true;
  }
}

export function connectionKey(deviceId, appId) {
  return JSON.stringify([deviceId, appId]);
}
