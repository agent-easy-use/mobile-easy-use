import { requestController } from '../common/controller.js';
import { runInputAction } from './common/input-action.js';
import { prepareInputCommand } from './common/input-target.js';
import { runOnMainThread } from './common/main-thread.js';

const INPUT_ACTION = 'ios.input.perform';
const INPUT_TIMEOUT_MS = 30000;

function failure(action, code, message) {
  return { ok: false, action, mode: 'semantic', error: { code, message } };
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  const separator = message.indexOf(':');
  return separator > 0 ? message.slice(0, separator) : 'DRIVER_ERROR';
}

async function dispatch(action, target, parameters = {}) {
  let command;
  const expiresAt = Date.now() + INPUT_TIMEOUT_MS - 1000;
  try {
    command = await runOnMainThread(() => prepareInputCommand(action, target, parameters));
    if (Date.now() >= expiresAt) throw new Error('INPUT_TIMEOUT: input expired during target resolution');
  } catch (error) {
    return failure(action, errorCode(error), error instanceof Error ? error.message : String(error));
  }
  const reply = await requestController(INPUT_ACTION, {
    command: { ...command, expiresAt },
  }, expiresAt - Date.now() + 1000);
  if (!reply.ok) {
    const message = reply.responsePayload?.error?.message ?? 'XCTest input driver failed';
    return failure(
      action,
      reply.responsePayload?.error?.code ?? errorCode(new Error(message)),
      message,
    );
  }
  return reply.responsePayload;
}

async function click(target) {
  return runInputAction(() => dispatch('click', target));
}

async function input(target, text) {
  return runInputAction(() => dispatch('input', target, { text }));
}

async function scroll(target, direction, distance = 300) {
  return runInputAction(() => dispatch('scroll', target, { direction, distance }));
}

async function longPress(target, duration = 600) {
  return runInputAction(() => dispatch('longPress', target, { duration }));
}

const IOSInput = Object.freeze({ click, input, scroll, longPress });

export { IOSInput, click, input, longPress, scroll };
