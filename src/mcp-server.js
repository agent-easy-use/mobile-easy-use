import { randomUUID } from 'node:crypto';
import { ConnectionInstance, connectionKey } from './mcp-connection.js';
import { operationErrorResult } from './mcp-api/operation-result.js';
import { McpJsonlLogger } from './mcp-logger.js';
import { MCP_VERSION } from './package-info.js';

const PROTOCOL_VERSION = '2025-11-25';
const OPERATION_TOOLS = new Set(['call_function', 'eval_script']);
const CONNECTION_TOOLS = new Set(['connect', 'disconnect', ...OPERATION_TOOLS]);
const NOOP_LOGGER = Object.freeze({
  request() {},
  response() {},
  parseError() {},
});

export class MobileMcpServer {
  constructor(deviceManager, {
    logDirectory,
    createConnectionId = randomUUID,
    createLogger = logDirectory === undefined
      ? () => NOOP_LOGGER
      : () => new McpJsonlLogger(logDirectory),
    createConnection,
    gadgetConnectionOptions,
  } = {}) {
    this.connections = new Map();
    this.processLogger = createLogger();
    this.createConnection = createConnection ?? ((target) => new ConnectionInstance(
      deviceManager,
      target,
      {
        connectionId: createConnectionId(),
        logger: createLogger(),
        gadgetConnectionOptions,
      },
    ));
  }

  async handle(message) {
    if (message === null || typeof message !== 'object'
        || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return this.#executeProcess(
        message,
        async () => errorResponse(message?.id ?? null, -32600, 'Invalid Request'),
      );
    }

    const toolName = message.method === 'tools/call'
      ? message.params?.name ?? '<missing>'
      : null;
    if (!CONNECTION_TOOLS.has(toolName)) {
      return this.#executeProcess(message, () => this.#handleProcessRequest(message, toolName));
    }

    let target;
    try {
      target = parseTarget(message.params?.arguments);
    } catch (error) {
      return this.#executeProcess(message, async () => toolCallErrorResponse(message, error));
    }
    const key = connectionKey(target.deviceId, target.appId);

    if (toolName === 'connect') {
      return this.#connect(message, key, target);
    }

    const connection = this.connections.get(key);
    if (connection === undefined) {
      if (toolName === 'disconnect') {
        return this.#executeProcess(message, async () => toolCallSuccessResponse(message, {
          connected: false,
          state: 'disconnected',
        }));
      }
      return this.#executeProcess(message, async () => toolCallErrorResponse(
        message,
        new Error(`Connect to MobileEasyUse for deviceId "${target.deviceId}" and appId "${target.appId}" first`),
      ));
    }

    return connection.execute(message, async () => {
      const response = await this.#handleConnectionTool(connection, message, toolName);
      if (toolName === 'disconnect' && response.result.isError !== true) {
        this.connections.delete(key);
      }
      return response;
    });
  }

  async closeAll() {
    const connections = [...this.connections.values()];
    this.connections.clear();
    let firstError = null;
    for (const connection of connections) {
      try {
        await connection.disconnect();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== null) throw firstError;
  }

  handleParseError(error, line) {
    this.processLogger.parseError(error, line);
    const response = errorResponse(null, -32700, `Parse error: ${error.message}`);
    this.processLogger.response(response);
    return response;
  }

  async #connect(message, key, target) {
    const existing = this.connections.get(key);
    const connection = existing ?? this.createConnection(message.params.arguments);
    if (existing === undefined) {
      this.connections.set(key, connection);
    }
    return connection.execute(message, async () => {
      const requestedPlatform = message.params.arguments?.platform;
      if (existing !== undefined && connection.platform !== requestedPlatform) {
        return toolCallErrorResponse(
          message,
          new Error(
            `MobileEasyUse instance for deviceId "${target.deviceId}" and appId `
            + `"${target.appId}" already uses platform "${connection.platform}"`,
          ),
        );
      }
      const endpointOwner = connection.isUsable
        ? null
        : this.#findEndpointOwner(message.params.arguments, key);
      if (endpointOwner !== null) {
        if (existing === undefined) this.connections.delete(key);
        return toolCallErrorResponse(
          message,
          new Error(
            `Host endpoint ${endpointOwner.address} is already used by deviceId `
            + `"${endpointOwner.deviceId}" and appId "${endpointOwner.appId}"`,
          ),
        );
      }
      const response = await this.#handleConnectionTool(connection, message, 'connect');
      if (existing === undefined && response.result.isError === true) {
        this.connections.delete(key);
      }
      return response;
    });
  }

  async #handleConnectionTool(connection, message, toolName) {
    try {
      let value;
      if (toolName === 'connect') {
        value = await connection.connect(message.params.arguments);
      } else if (toolName === 'disconnect') {
        value = await connection.disconnect();
      } else if (toolName === 'call_function') {
        value = await connection.callFunction(message.params.arguments);
      } else {
        value = await connection.evalScript(message.params.arguments);
      }
      return toolCallSuccessResponse(message, value);
    } catch (error) {
      return toolCallErrorResponse(message, error);
    }
  }

  async #handleProcessRequest(message, toolName) {
    try {
      if (message.method === 'initialize') {
        return resultResponse(message.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mobile-easy-use', version: MCP_VERSION },
        });
      }
      if (message.method === 'notifications/initialized') return null;
      if (message.method === 'ping') return resultResponse(message.id, {});
      if (message.method === 'tools/list') {
        return resultResponse(message.id, { tools: toolDefinitions });
      }
      if (message.method === 'tools/call') {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      return errorResponse(message.id, -32601, `Method not found: ${message.method}`);
    } catch (error) {
      if (message.method === 'tools/call') return toolCallErrorResponse(message, error);
      return errorResponse(message.id, -32603, error.message);
    }
  }

  async #executeProcess(message, operation) {
    this.processLogger.request(message);
    const response = await operation();
    if (response !== null) this.processLogger.response(response);
    return response;
  }

  #findEndpointOwner(input, requestedKey) {
    const { ip, port } = input ?? {};
    if (typeof ip !== 'string' || !Number.isInteger(port)) return null;
    const address = `${ip}:${port}`;
    for (const [key, connection] of this.connections) {
      if (key !== requestedKey && connection.address === address) {
        return {
          address,
          deviceId: connection.deviceId,
          appId: connection.appId,
        };
      }
    }
    return null;
  }
}

export function toolCallErrorResponse(message, error) {
  const toolName = message?.params?.name ?? '<missing>';
  const value = OPERATION_TOOLS.has(toolName)
    ? operationErrorResult(error)
    : {
      error: error.message,
      ...(typeof error?.code === 'string' ? { code: error.code } : {}),
      ...(error?.details !== undefined ? { details: error.details } : {}),
    };
  return resultResponse(message?.id ?? null, toolResult(value, true));
}

export function toolCallSuccessResponse(message, value) {
  return resultResponse(message?.id ?? null, toolResult(value, false));
}

function parseTarget(input) {
  const { deviceId, appId } = input ?? {};
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('deviceId must be a non-empty string');
  }
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error('appId must be a non-empty string');
  }
  return { deviceId, appId };
}

export const toolDefinitions = [
  {
    name: 'connect',
    description: 'Create or reuse the connection identified by deviceId and appId, initialize its Android or iOS SDK runtime, and report runtime and Release compatibility. Surface compatibilityWarning and a non-null compatibility.upgradeRecommendation to the user as non-blocking advisories.',
    inputSchema: {
      type: 'object',
      required: ['platform', 'deviceId', 'appId', 'runtimePort', 'ip', 'port'],
      properties: {
        platform: {
          type: 'string',
          enum: ['android', 'ios'],
          description: 'SDK platform to load into the target process.',
        },
        deviceId: {
          type: 'string',
          minLength: 1,
          description: 'Canonical ADB serial, CoreDevice identifier, or simulator UDID.',
        },
        appId: {
          type: 'string',
          minLength: 1,
          description: 'Android package name or iOS bundle identifier.',
        },
        runtimePort: {
          type: 'integer',
          minimum: 1,
          maximum: 65535,
          description: 'Device-side MobileEasyUse runtime listen port.',
        },
        ip: { type: 'string', description: 'Prepared Host endpoint IPv4 address; to-run uses 127.0.0.1 for USB devices and simulators.' },
        port: {
          type: 'integer',
          minimum: 1,
          maximum: 65535,
          description: 'Prepared Host endpoint port after ADB forwarding, iproxy, or direct simulator resolution.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['connected', 'state', 'target', 'ip', 'port', 'fridaTarget', 'runtime', 'compatibility'],
      properties: {
        connected: { type: 'boolean' },
        state: { type: 'string', enum: ['connected'] },
        target: {
          type: 'object',
          required: ['platform', 'deviceId', 'appId', 'runtimePort'],
          properties: {
            platform: { type: 'string', enum: ['android', 'ios'] },
            deviceId: { type: 'string' },
            appId: { type: 'string' },
            runtimePort: { type: 'integer' },
          },
          additionalProperties: false,
        },
        ip: { type: 'string' },
        port: { type: 'integer' },
        fridaTarget: { type: 'string', enum: ['Gadget'] },
        runtime: {
          type: 'object',
          description: 'Runtime identity reported by the SDK loaded in the target App.',
          required: ['platform', 'available', 'appId', 'releaseVersion'],
          properties: {
            platform: { type: 'string', enum: ['android', 'ios'] },
            available: { type: 'boolean' },
            appId: { type: 'string' },
            releaseVersion: { type: 'string' },
          },
          additionalProperties: false,
        },
        compatibility: {
          description: 'Compatibility between the App Release and this MCP version, or null when the online catalog could not be checked.',
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              required: ['releaseVersion', 'mcpVersion', 'minimumMcpVersion', 'maximumMcpVersion', 'mcpCommand', 'compatible', 'upgradeRecommendation'],
              properties: {
                releaseVersion: { type: 'string' },
                mcpVersion: { type: 'string' },
                minimumMcpVersion: { type: 'string' },
                maximumMcpVersion: { type: 'string' },
                mcpCommand: { type: 'string' },
                compatible: { type: 'boolean', enum: [true] },
                upgradeRecommendation: {
                  description: 'Optional non-blocking MCP upgrade advice to surface to the user.',
                  oneOf: [{ type: 'string' }, { type: 'null' }],
                },
              },
              additionalProperties: false,
            },
          ],
        },
        compatibilityWarning: {
          type: 'string',
          description: 'Non-blocking notice that compatibility could not be checked; surface it to the user.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'disconnect',
    description: 'Disconnect the MobileEasyUse instance identified by deviceId and appId, destroy its runtime, and clear its modules.',
    inputSchema: {
      type: 'object',
      required: ['deviceId', 'appId'],
      properties: targetSelectorProperties(),
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['connected', 'state'],
      properties: {
        connected: { type: 'boolean', enum: [false] },
        state: { type: 'string', enum: ['disconnected'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'call_function',
    description: 'On the connection instance identified by deviceId and appId, load or reuse a probe ES Module, call one export, and return its result or error with action-scoped evidence.',
    inputSchema: {
      type: 'object',
      required: ['deviceId', 'appId', 'filePath', 'functionName'],
      properties: {
        ...targetSelectorProperties(),
        filePath: {
          type: 'string',
          minLength: 1,
          description: 'Absolute path to a UTF-8 standard ES Module file readable by the MCP server.',
        },
        functionName: {
          type: 'string',
          minLength: 1,
          description: 'Name of the function exported by the ES Module.',
        },
        args: {
          type: 'array',
          default: [],
          description: 'Positional arguments passed to the exported function.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: operationOutputSchema(),
  },
  {
    name: 'eval_script',
    description: 'On the connection instance identified by deviceId and appId, evaluate one inline async IIFE and return its result or error with action-scoped evidence. The source must have the form `(async () => { ... })()`.',
    inputSchema: {
      type: 'object',
      required: ['deviceId', 'appId', 'source'],
      properties: {
        ...targetSelectorProperties(),
        source: {
          type: 'string',
          minLength: 1,
          description: 'Complete async IIFE source, for example `(async () => { return runtimeStatus(); })()`.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: operationOutputSchema(),
  },
];

function targetSelectorProperties() {
  return {
    deviceId: {
      type: 'string',
      minLength: 1,
      description: 'Canonical ADB serial, CoreDevice identifier, or simulator UDID.',
    },
    appId: {
      type: 'string',
      minLength: 1,
      description: 'Android package name or iOS bundle identifier.',
    },
  };
}

function operationOutputSchema() {
  return {
    type: 'object',
    required: ['evidence'],
    properties: {
      result: {},
      error: {
        type: 'object',
        required: ['message', 'stack'],
        properties: {
          message: { type: 'string' },
          stack: { type: 'string' },
        },
        additionalProperties: false,
      },
      evidence: {
        type: 'array',
        description: 'Evidence JSON files, ordered by the first record for each action.',
        items: {
          type: 'object',
          required: ['actionDescription', 'evidencePath'],
          properties: {
            actionDescription: { type: 'string' },
            evidencePath: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    oneOf: [
      { required: ['result'], not: { required: ['error'] } },
      { required: ['error'], not: { required: ['result'] } },
    ],
    additionalProperties: false,
  };
}

function toolResult(value, isError) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

function resultResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
