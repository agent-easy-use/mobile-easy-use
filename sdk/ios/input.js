import ObjC from 'frida-objc-bridge';
import { requestController } from '../common/controller.js';
import { runInputAction } from './common/input-action.js';
import { rectValue } from './common/geometry.js';
import { runOnMainThread } from './common/main-thread.js';
import { requireUiPath, viewIsVisibleNow } from './ui/index.js';

const INPUT_ACTION = 'ios.input.perform';
const INPUT_TIMEOUT_MS = 30000;

function failure(action, code, message) {
  return { ok: false, action, mode: 'semantic', error: { code, message } };
}

function locationTarget(target) {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return null;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  if (target.x < 0 || target.y < 0) {
    throw new Error('INVALID_COORDINATES: coordinates must be non-negative');
  }
  return { type: 'location', x: Number(target.x), y: Number(target.y) };
}

function isUIView(target) {
  if (!ObjC.available || target === null || typeof target !== 'object') return false;
  try {
    return typeof target.isKindOfClass_ === 'function'
      && Boolean(target.isKindOfClass_(ObjC.classes.UIView));
  } catch (_) {
    return false;
  }
}

function viewTarget(view) {
  if (!viewIsVisibleNow(view)) {
    throw new Error('VIEW_NOT_VISIBLE: UIView is detached, hidden, or has empty bounds');
  }
  const bounds = rectValue(view.convertRect_toView_(view.bounds(), NULL));
  if (bounds === null || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('VIEW_NOT_VISIBLE: UIView screen bounds are unavailable');
  }
  const { x, y, width, height } = bounds;
  return {
    type: 'location',
    x: x + (width / 2),
    y: y + (height / 2),
    bounds: { x, y, width, height },
  };
}

async function normalizeTarget(target) {
  if (typeof target === 'string') {
    if (target.length === 0) throw new Error('INVALID_TARGET: identifier must not be empty');
    return { type: 'identifier', value: target };
  }
  if (Array.isArray(target)) {
    return { type: 'path', steps: [...requireUiPath(target)] };
  }
  const location = locationTarget(target);
  if (location !== null) return location;
  if (isUIView(target)) return runOnMainThread(() => viewTarget(target));
  throw new Error('INVALID_TARGET: expected an identifier, UI path, UIView, or {x, y}');
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  const separator = message.indexOf(':');
  return separator > 0 ? message.slice(0, separator) : 'DRIVER_ERROR';
}

async function dispatch(action, target, parameters = {}) {
  let normalizedTarget;
  try {
    normalizedTarget = await normalizeTarget(target);
  } catch (error) {
    return failure(action, errorCode(error), error instanceof Error ? error.message : String(error));
  }
  const reply = await requestController(INPUT_ACTION, {
    command: {
      action,
      target: normalizedTarget,
      ...parameters,
    },
  }, INPUT_TIMEOUT_MS);
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
