import ObjC from 'frida-objc-bridge';

const XCUI_ELEMENT_TYPE_ANY = 0;
const XCUI_APPLICATION_STATE_UNKNOWN = 0;
const XCUI_APPLICATION_STATE_NOT_RUNNING = 1;
const XCUI_APPLICATION_STATE_RUNNING_FOREGROUND = 4;
const ACTIONS = new Set(['click', 'input', 'scroll', 'longPress']);
let operationTail = Promise.resolve();
let boundBundleId = null;

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
    const state = Number(app.state());
    if (state === XCUI_APPLICATION_STATE_UNKNOWN
        || state === XCUI_APPLICATION_STATE_NOT_RUNNING) {
      throw new Error(`${appId} must already be running with its Frida session attached`);
    }
    if (state !== XCUI_APPLICATION_STATE_RUNNING_FOREGROUND) app.activate();
    if (!Boolean(app.waitForState_timeout_(XCUI_APPLICATION_STATE_RUNNING_FOREGROUND, 10))) {
      throw new Error(`${appId} did not reach the foreground`);
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

function requireFinitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`INVALID_ARGUMENT: ${name} must be a positive finite number`);
  }
  return Number(value);
}

function predicateArguments(value) {
  const argumentsArray = ObjC.classes.NSMutableArray.array();
  argumentsArray.addObject_(value);
  return argumentsArray;
}

function parseStep(step) {
  if (typeof step !== 'string') {
    throw new Error('INVALID_TARGET: UI path steps must be strings');
  }
  const separator = step.indexOf('::');
  if (separator <= 0 || separator + 2 >= step.length) {
    throw new Error(`INVALID_TARGET: invalid UI path step ${step}`);
  }
  const kind = step.slice(0, separator);
  if (kind !== 'identifier' && kind !== 'label') {
    throw new Error(`INVALID_TARGET: unsupported UI path step ${kind}`);
  }
  return { kind, value: step.slice(separator + 2) };
}

function uniqueElement(root, steps) {
  let current = root;
  for (const rawStep of steps) {
    const { kind, value } = parseStep(rawStep);
    let query = current.descendantsMatchingType_(XCUI_ELEMENT_TYPE_ANY);
    query = kind === 'identifier'
      ? query.matchingIdentifier_(value)
      : query.matchingPredicate_(
        ObjC.classes.NSPredicate.predicateWithFormat_argumentArray_(
          'label == %@',
          predicateArguments(value),
        ),
      );
    const count = Number(query.count());
    if (count === 0) throw new Error(`ELEMENT_NOT_FOUND: ${rawStep}`);
    if (count > 1) throw new Error(`ELEMENT_AMBIGUOUS: ${rawStep} matched ${count} elements`);
    current = query.elementBoundByIndex_(0);
  }
  if (!Boolean(current.exists())) throw new Error('ELEMENT_NOT_FOUND: element no longer exists');
  return current;
}

function resolveTarget(app, target) {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error('INVALID_TARGET: target must be an object');
  }
  if (target.type === 'identifier') {
    if (typeof target.value !== 'string' || target.value.length === 0) {
      throw new Error('INVALID_TARGET: identifier must be a non-empty string');
    }
    return { type: 'element', element: uniqueElement(app, [`identifier::${target.value}`]) };
  }
  if (target.type === 'path') {
    if (!Array.isArray(target.steps) || target.steps.length === 0) {
      throw new Error('INVALID_TARGET: path must contain at least one step');
    }
    return { type: 'element', element: uniqueElement(app, target.steps) };
  }
  if (target.type === 'location') {
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)
        || target.x < 0 || target.y < 0) {
      throw new Error('INVALID_COORDINATES: coordinates must be non-negative finite numbers');
    }
    return {
      type: 'location',
      x: Number(target.x),
      y: Number(target.y),
      bounds: target.bounds ?? null,
    };
  }
  throw new Error(`INVALID_TARGET: unsupported target type ${String(target.type)}`);
}

function coordinate(app, x, y) {
  return app.coordinateWithNormalizedOffset_([0, 0]).coordinateWithOffset_([x, y]);
}

function targetCoordinate(app, target) {
  if (target.type === 'location') return coordinate(app, target.x, target.y);
  return target.element.coordinateWithNormalizedOffset_([0.5, 0.5]);
}

function rectValue(rect) {
  const origin = rect?.origin ?? rect?.[0];
  const size = rect?.size ?? rect?.[1];
  const value = {
    x: Number(origin?.x ?? origin?.[0]),
    y: Number(origin?.y ?? origin?.[1]),
    width: Number(size?.width ?? size?.[0]),
    height: Number(size?.height ?? size?.[1]),
  };
  return Object.values(value).every(Number.isFinite) ? value : null;
}

function targetBounds(app, target) {
  if (target.type === 'element') return rectValue(target.element.frame());
  if (target.bounds !== null) return target.bounds;
  return rectValue(app.frame());
}

function scrollCoordinates(app, target, direction, distance) {
  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    throw new Error('INVALID_ARGUMENT: direction must be up, down, left, or right');
  }
  const bounds = targetBounds(app, target);
  if (bounds === null || bounds.width < 2 || bounds.height < 2) {
    throw new Error('VIEW_NOT_VISIBLE: target has no visible gesture area');
  }
  const horizontal = direction === 'left' || direction === 'right';
  const span = horizontal ? bounds.width : bounds.height;
  const travel = Math.min(distance, Math.max(1, span - 2));
  const half = travel / 2;
  const centerX = target.type === 'location' ? target.x : bounds.x + (bounds.width / 2);
  const centerY = target.type === 'location' ? target.y : bounds.y + (bounds.height / 2);
  let startX = centerX;
  let startY = centerY;
  let endX = centerX;
  let endY = centerY;
  if (direction === 'up') { startY += half; endY -= half; }
  if (direction === 'down') { startY -= half; endY += half; }
  if (direction === 'left') { startX += half; endX -= half; }
  if (direction === 'right') { startX -= half; endX += half; }
  const clamp = (value, minimum, maximum) => Math.min(maximum - 1, Math.max(minimum, value));
  startX = clamp(startX, bounds.x, bounds.x + bounds.width);
  endX = clamp(endX, bounds.x, bounds.x + bounds.width);
  startY = clamp(startY, bounds.y, bounds.y + bounds.height);
  endY = clamp(endY, bounds.y, bounds.y + bounds.height);
  return {
    start: coordinate(app, startX, startY),
    end: coordinate(app, endX, endY),
    startX,
    startY,
    endX,
    endY,
  };
}

function performOnMainThread(request) {
  const app = ObjC.classes.XCUIApplication.alloc().initWithBundleIdentifier_(request.bundleId);
  if (Number(app.state()) !== XCUI_APPLICATION_STATE_RUNNING_FOREGROUND) {
    return fail(request.action, 'TARGET_NOT_FOREGROUND', `${request.bundleId} is not running in foreground`);
  }
  const target = resolveTarget(app, request.target);
  if (target.type === 'element' && !Boolean(target.element.isHittable())) {
    return fail(request.action, 'ELEMENT_NOT_HITTABLE', 'The XCTest element is not hittable');
  }

  if (request.action === 'click') {
    if (target.type === 'element') target.element.tap();
    else targetCoordinate(app, target).tap();
    return success('click');
  }
  if (request.action === 'input') {
    if (typeof request.text !== 'string' || request.text.length === 0) {
      return fail('input', 'INVALID_ARGUMENT', 'text must be a non-empty string');
    }
    if (target.type === 'element') {
      target.element.tap();
      target.element.typeText_(request.text);
    } else {
      targetCoordinate(app, target).tap();
      app.typeText_(request.text);
    }
    return success('input', { textLength: request.text.length });
  }
  if (request.action === 'longPress') {
    const duration = requireFinitePositive(request.duration, 'duration') / 1000;
    if (target.type === 'element') target.element.pressForDuration_(duration);
    else targetCoordinate(app, target).pressForDuration_(duration);
    return success('longPress');
  }

  const distance = requireFinitePositive(request.distance, 'distance');
  const gesture = scrollCoordinates(app, target, request.direction, distance);
  gesture.start.pressForDuration_thenDragToCoordinate_(0.05, gesture.end);
  return success('scroll', {
    direction: request.direction,
    distance,
    startX: gesture.startX,
    startY: gesture.startY,
    endX: gesture.endX,
    endY: gesture.endY,
  });
}

async function perform(rawRequest) {
  let request;
  try {
    if (!ObjC.available || !ObjC.classes.XCUIApplication) {
      return fail(rawRequest?.action ?? 'unknown', 'BACKEND_UNAVAILABLE', 'XCUIAutomation is unavailable');
    }
    request = { ...requireRequest(rawRequest), bundleId: configuredBundleId() };
    return await runOnMainThread(() => performOnMainThread(request));
  } catch (error) {
    const message = errorMessage(error);
    const separator = message.indexOf(':');
    return fail(request?.action ?? rawRequest?.action ?? 'unknown', separator > 0
      ? message.slice(0, separator)
      : 'XCTEST_ERROR', message);
  }
}

function performSerial(request) {
  const operation = operationTail.then(() => perform(request), () => perform(request));
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
