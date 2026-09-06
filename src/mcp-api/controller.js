import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { IOS_CONTROLLER_ACTIONS } from './ios-controller.js';

const CONTROLLER_ACTIONS = new Map([
  ['file.write', writeFileAction],
  ...IOS_CONTROLLER_ACTIONS,
]);

export async function handleControllerMessage(
  script,
  message,
  data,
  owner,
  connection = owner.currentConnection,
) {
  const reply = await handleControllerRequest(message, data, owner, connection);
  if (reply === null) return;
  script.post({
    type: `mobile-easy-use.controller.response.${reply.requestId}`,
    payload: reply.response,
  });
}

async function handleControllerRequest(message, data, owner, connection) {
  if (message?.type !== 'send') return null;
  const event = message.payload;
  if (event?.source !== 'mobile-easy-use' || event.channel !== 'controller.request') {
    return null;
  }

  const request = event.payload;
  if (request === null || typeof request !== 'object'
      || typeof request.requestId !== 'string' || request.requestId.length === 0) {
    return null;
  }

  try {
    if (typeof request.action !== 'string' || request.action.length === 0) {
      throw new Error('Controller action must be a non-empty string');
    }
    const handler = CONTROLLER_ACTIONS.get(request.action);
    if (handler === undefined) {
      throw new Error(`Unsupported Controller action: ${request.action}`);
    }
    const responsePayload = await handler(request.payload, data, owner, connection);
    return {
      requestId: request.requestId,
      response: { ok: true, responsePayload },
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      response: {
        ok: false,
        responsePayload: {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      },
    };
  }
}

async function writeFileAction(payload, data, owner) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
      || typeof payload.filePath !== 'string' || payload.filePath.length === 0) {
    throw new Error('file.write payload.filePath must be a non-empty string');
  }
  if (data === null || data === undefined) {
    throw new Error('file.write payload.blob is required');
  }

  const root = resolve(owner.evidenceDirectory);
  const filePath = isAbsolute(payload.filePath)
    ? resolve(payload.filePath)
    : resolve(root, payload.filePath);
  const pathFromRoot = relative(root, filePath);
  if (pathFromRoot.length === 0
      || pathFromRoot === '..'
      || pathFromRoot.startsWith(`..${sep}`)
      || isAbsolute(pathFromRoot)) {
    throw new Error('file.write filePath must stay inside the artifact directory');
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(data));
  return { filePath };
}
