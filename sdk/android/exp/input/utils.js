import { errorMessage, safeEmit } from '../../common/index.js';
import Java from 'frida-java-bridge';
import { findFocusedRootView, findUiView } from '../ui.js';

function inputFailureCode(error) {
  const message = errorMessage(error);
  if (message.includes('INVALID_COORDINATES')) return 'INVALID_COORDINATES';
  if (message.includes('INVALID_ARGUMENT')) return 'INVALID_ARGUMENT';
  if (message.includes('SecurityException') || message.toLowerCase().includes('permission')) {
    return 'PERMISSION_DENIED';
  }
  if (message.includes('INJECTION_REJECTED')) return 'INJECTION_REJECTED';
  if (message.includes('DISPLAY_UNAVAILABLE')) return 'DISPLAY_UNAVAILABLE';
  if (message.includes('FOCUSED_WINDOW_UNAVAILABLE')) return 'FOCUSED_WINDOW_UNAVAILABLE';
  if (message.includes('VIEW_NOT_FOUND')) return 'VIEW_NOT_FOUND';
  if (message.includes('VIEW_NOT_VISIBLE')) return 'VIEW_NOT_VISIBLE';
  if (message.includes('INVALID_TARGET')) return 'INVALID_TARGET';
  return 'BACKEND_UNAVAILABLE';
}

function resolveViewTarget(view) {
  let result;
  Java.performNow(() => {
    let androidView;
    try {
      androidView = Java.cast(view, Java.use('android.view.View'));
    } catch (_) {
      throw new Error('INVALID_TARGET: expected an Android View');
    }
    if (!androidView
      || typeof androidView.getLocationOnScreen !== 'function'
      || typeof androidView.getWidth !== 'function'
      || typeof androidView.getHeight !== 'function') {
      throw new Error('INVALID_TARGET: expected an Android View');
    }
    if (typeof androidView.isAttachedToWindow === 'function'
      && !Boolean(androidView.isAttachedToWindow())) {
      throw new Error('VIEW_NOT_VISIBLE: View is detached');
    }
    if (typeof androidView.isShown === 'function' && !Boolean(androidView.isShown())) {
      throw new Error('VIEW_NOT_VISIBLE: View is not shown');
    }
    const width = Number(androidView.getWidth());
    const height = Number(androidView.getHeight());
    if (!(width > 0) || !(height > 0)) {
      throw new Error('VIEW_NOT_VISIBLE: View has empty bounds');
    }
    const location = Java.array('int', [0, 0]);
    androidView.getLocationOnScreen(location);
    const left = Number(location[0]?.value ?? location[0]);
    const top = Number(location[1]?.value ?? location[1]);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      throw new Error('VIEW_NOT_VISIBLE: View location is unavailable');
    }
    result = {
      x: left + (width / 2),
      y: top + (height / 2),
      bounds: { left, top, right: left + width, bottom: top + height, width, height },
      targetType: 'view',
    };
  });
  return result;
}

function resolveInputTarget(target) {
  if (Array.isArray(target)) {
    const view = findUiView(target);
    if (!view) {
      throw new Error(`VIEW_NOT_FOUND: ${target.join(' > ')}`);
    }
    return { ...resolveViewTarget(view), targetType: 'path' };
  }
  if (typeof target === 'number') {
    if (!Number.isInteger(target) || target <= 0) {
      throw new Error('INVALID_TARGET: resource ID must be a positive integer');
    }
    if (!findFocusedRootView()) {
      throw new Error('FOCUSED_WINDOW_UNAVAILABLE: no focused App Window root');
    }
    const view = findUiView(target);
    if (!view) {
      throw new Error(`VIEW_NOT_FOUND: ${target}`);
    }
    return { ...resolveViewTarget(view), targetType: 'id', resourceId: target };
  }
  if (target !== null
    && typeof target === 'object'
    && typeof target.getLocationOnScreen === 'function') {
    return resolveViewTarget(target);
  }
  if (target !== null
    && typeof target === 'object'
    && Number.isFinite(target.x)
    && Number.isFinite(target.y)) {
    if (target.x < 0 || target.y < 0) {
      throw new Error('INVALID_COORDINATES: coordinates must be non-negative');
    }
    return { x: Number(target.x), y: Number(target.y), bounds: null, targetType: 'location' };
  }
  if (target !== null
    && typeof target === 'object'
    && typeof target.getClass === 'function') {
    return resolveViewTarget(target);
  }
  throw new Error('INVALID_TARGET: expected R.id, Android View, or {x, y}');
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function getDisplayBounds() {
  let bounds;
  Java.performNow(() => {
    const application = Java.use('android.app.ActivityThread').currentApplication();
    const service = application?.getSystemService('display');
    const DisplayManager = Java.use('android.hardware.display.DisplayManager');
    const manager = service ? Java.cast(service, DisplayManager) : null;
    const display = manager?.getDisplay(0);
    if (!display) {
      throw new Error('DISPLAY_UNAVAILABLE: 0');
    }
    const size = Java.use('android.graphics.Point').$new();
    display.getRealSize(size);
    bounds = { width: Number(size.x.value ?? size.x), height: Number(size.y.value ?? size.y) };
  });
  return bounds;
}

function getInputManager() {
  const application = Java.use('android.app.ActivityThread').currentApplication();
  if (!application) {
    throw new Error('Application is unavailable');
  }
  const service = application.getSystemService('input');
  const InputManager = Java.use('android.hardware.input.InputManager');
  const manager = service && Java.cast ? Java.cast(service, InputManager) : service;
  if (!manager?.injectInputEvent) {
    throw new Error('InputManager.injectInputEvent is unavailable');
  }
  return manager;
}

const INPUT_EVENT_INJECTION_MODE_ASYNC = 0;

function injectInputEvent(event, mode = INPUT_EVENT_INJECTION_MODE_ASYNC) {
  const manager = getInputManager();
  const injection = manager.injectInputEvent;
  const overload = typeof injection.overload === 'function'
    ? injection.overload('android.view.InputEvent', 'int')
    : null;
  const accepted = overload
    ? overload.call(manager, event, mode)
    : injection.call(manager, event, mode);
  if (!Boolean(accepted)) {
    throw new Error('INJECTION_REJECTED');
  }
}

function recycleInputEvent(event) {
  try {
    event?.recycle?.();
  } catch (error) {
    safeEmit('probe.cleanup_error', { resourceType: 'input-event', message: errorMessage(error) });
  }
}

function injectMotionEvent(
  downTime,
  eventTime,
  action,
  x,
  y,
  mode = INPUT_EVENT_INJECTION_MODE_ASYNC,
) {
  Java.performNow(() => {
    const MotionEvent = Java.use('android.view.MotionEvent');
    const InputDevice = Java.use('android.view.InputDevice');
    const motionEvent = MotionEvent.obtain(downTime, eventTime, action, x, y, 0);
    motionEvent.setSource(InputDevice.SOURCE_TOUCHSCREEN.value ?? InputDevice.SOURCE_TOUCHSCREEN);
    if (typeof motionEvent.setDisplayId === 'function') {
      motionEvent.setDisplayId(0);
    }
    try {
      injectInputEvent(motionEvent, mode);
    } finally {
      recycleInputEvent(motionEvent);
    }
  });
}

function uptimeMillis() {
  let uptime;
  Java.performNow(() => {
    uptime = Number(Java.use('android.os.SystemClock').uptimeMillis());
  });
  return uptime;
}

async function runInputAction(action, operation) {
  try {
    const result = await operation();
    await delay(2000);
    return { ok: true, action, ...result };
  } catch (error) {
    return {
      ok: false,
      action,
      error: { code: inputFailureCode(error), message: errorMessage(error) },
    };
  }
}

async function performPress(x, y, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('INVALID_ARGUMENT: press duration must be non-negative');
  }
  if (!Number.isFinite(x) || x < 0 || !Number.isFinite(y) || y < 0) {
    throw new Error('INVALID_COORDINATES: coordinates must be non-negative finite numbers');
  }
  const downTime = uptimeMillis();
  let downInjected = false;
  try {
    injectMotionEvent(downTime, downTime, 0, x, y);
    downInjected = true;
    await delay(durationMs);
    injectMotionEvent(downTime, uptimeMillis(), 1, x, y);
    downInjected = false;
    return { x, y, displayId: 0, pressDurationMs: durationMs, injectedEvents: 2 };
  } finally {
    if (downInjected) {
      try {
        injectMotionEvent(downTime, uptimeMillis(), 3, x, y);
      } catch (_) {
      }
    }
  }
}

export {
  delay,
  getDisplayBounds,
  injectInputEvent,
  injectMotionEvent,
  performPress,
  recycleInputEvent,
  resolveInputTarget,
  runInputAction,
  uptimeMillis,
};
