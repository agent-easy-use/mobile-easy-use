// Frida driver loaded into the standalone XCTest Runner process.
import ObjC from 'frida-objc-bridge';
import { createEventBackend } from './ios-input/events.js';
import { requirePoint } from '../ios/common/input-geometry.js';

const XCUI_APPLICATION_STATE_UNKNOWN = 0;
const XCUI_APPLICATION_STATE_NOT_RUNNING = 1;
const XCUI_APPLICATION_STATE_RUNNING_FOREGROUND = 4;
const ACTIONS = new Set(['click', 'input', 'scroll', 'longPress']);
let operationTail = Promise.resolve();
let boundBundleId = null;
const events = createEventBackend(ObjC, runOnMainThread);

function fail(action, code, message) {
  return { ok: false, action, mode: 'semantic', error: { code, message } };
}

function success(action, details = {}) {
  return { ok: true, action, mode: 'semantic', ...details };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function runOnMainThread(work) {
  return new Promise((resolve, reject) => {
    ObjC.schedule(ObjC.mainQueue, () => {
      const pool = ObjC.classes.NSAutoreleasePool.alloc().init();
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      } finally {
        pool.release();
      }
    });
  });
}

function requireRequest(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('INVALID_ARGUMENT: request must be an object');
  }
  if (!ACTIONS.has(request.action)) {
    throw new Error('INVALID_ARGUMENT: unsupported input action');
  }
  return request;
}

function configuredBundleId() {
  if (boundBundleId === null) {
    throw new Error('BACKEND_UNAVAILABLE: XCTest driver is not bound to a target App');
  }
  return boundBundleId;
}

function requireBundleId(bundleId) {
  if (typeof bundleId !== 'string' || bundleId.length === 0) {
    throw new Error('INVALID_ARGUMENT: appId must be a non-empty string');
  }
  return bundleId;
}

async function bind(bundleId) {
  const appId = requireBundleId(bundleId);
  await runOnMainThread(() => {
    const app = ObjC.classes.XCUIApplication.alloc().initWithBundleIdentifier_(appId);
    try {
      const state = Number(app.state());
      if (state === XCUI_APPLICATION_STATE_UNKNOWN
          || state === XCUI_APPLICATION_STATE_NOT_RUNNING) {
        throw new Error(`${appId} must already be running with its Frida session attached`);
      }
      if (state !== XCUI_APPLICATION_STATE_RUNNING_FOREGROUND) app.activate();
      if (!Boolean(app.waitForState_timeout_(XCUI_APPLICATION_STATE_RUNNING_FOREGROUND, 10))) {
        throw new Error(`${appId} did not reach the foreground`);
      }
    } finally {
      app.release();
    }
  });
  boundBundleId = appId;
}

function driverStatus() {
  return {
    available: ObjC.available && Boolean(ObjC.classes.XCUIApplication)
      && boundBundleId !== null,
    platform: 'ios',
    driver: 'xctest',
    appId: boundBundleId,
  };
}

function requireForeground(app, bundleId) {
  if (Number(app.state()) !== XCUI_APPLICATION_STATE_RUNNING_FOREGROUND) {
    throw new Error(`TARGET_NOT_FOREGROUND: ${bundleId} is not running in foreground`);
  }
}

function validateCommand(request) {
  events.assertReady(request.expiresAt);
  if (request.action === 'input' && (typeof request.text !== 'string' || request.text.length === 0)) {
    throw new Error('INVALID_ARGUMENT: text must be a non-empty string');
  }
  if (request.action === 'longPress' && (!Number.isFinite(request.duration) || request.duration <= 0)) {
    throw new Error('INVALID_ARGUMENT: duration must be a positive finite number');
  }
  requirePoint(request.point, request.bounds);
  if (![1, 2, 3, 4].includes(request.orientation)) {
    throw new Error('INVALID_COORDINATES: a valid interface orientation is required');
  }
  if (request.action === 'scroll') {
    const gesture = request.gesture;
    requirePoint({ x: gesture?.startX, y: gesture?.startY }, request.bounds);
    requirePoint({ x: gesture?.endX, y: gesture?.endY }, request.bounds);
    if (gesture.startX === gesture.endX && gesture.startY === gesture.endY) {
      throw new Error('INVALID_COORDINATES: scroll endpoints must differ');
    }
  }
}

async function perform(rawRequest) {
  let request;
  let app;
  let bundleId;
  try {
    if (!ObjC.available || !ObjC.classes.XCUIApplication) {
      return fail(rawRequest?.action ?? 'unknown', 'BACKEND_UNAVAILABLE', 'XCUIAutomation is unavailable');
    }
    request = requireRequest(rawRequest);
    bundleId = configuredBundleId();
    validateCommand(request);
    await runOnMainThread(() => {
      app = ObjC.classes.XCUIApplication.alloc().initWithBundleIdentifier_(bundleId);
    });
    await events.perform(request, {
      expiresAt: request.expiresAt,
      beforeSubmit() {
        requireForeground(app, bundleId);
        if (Number(app.interfaceOrientation()) !== request.orientation) {
          throw new Error('INVALID_COORDINATES: interface orientation changed before dispatch');
        }
      },
    });
    if (request.action === 'input') return success('input', { textLength: request.text.length });
    if (request.action === 'scroll') return success('scroll', {
      direction: request.direction, distance: request.distance, ...request.gesture,
    });
    return success(request.action);
  } catch (error) {
    const message = errorMessage(error);
    const separator = message.indexOf(':');
    return fail(request?.action ?? rawRequest?.action ?? 'unknown', separator > 0
      ? message.slice(0, separator)
      : 'XCTEST_ERROR', message);
  } finally {
    if (app) await runOnMainThread(() => app.release());
  }
}

function performSerial(request) {
  // Preserve the App deadline across Host and Runner queues; never execute an expired tap.
  const operation = operationTail.then(() => perform(request));
  operationTail = operation.then(() => undefined, () => undefined);
  return operation;
}

rpc.exports = {
  async bind(appId) {
    await bind(appId);
    return driverStatus();
  },
  status() {
    return driverStatus();
  },
  perform(request) {
    return performSerial(request);
  },
};
