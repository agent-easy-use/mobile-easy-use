import ObjC from 'frida-objc-bridge';
import { rectValue } from './geometry.js';
import { intersectBounds, requirePoint, scrollCoordinates, validBounds } from './input-geometry.js';
import { findUiView, requireUiPath } from '../ui/index.js';

function rectOnScreen(view, space) {
  return rectValue(view.convertRect_toCoordinateSpace_(view.bounds(), space));
}

function activeWindow() {
  const app = ObjC.classes.UIApplication.sharedApplication();
  const scenes = app.connectedScenes().allObjects();
  const candidates = [];
  for (let i = 0; i < Number(scenes.count()); i += 1) {
    const scene = scenes.objectAtIndex_(i);
    if (Number(scene.activationState()) !== 0 || typeof scene.windows !== 'function') continue;
    const windows = scene.windows();
    for (let j = 0; j < Number(windows.count()); j += 1) {
      const window = windows.objectAtIndex_(j);
      if (Boolean(window.isKeyWindow())) candidates.push(window);
    }
  }
  if (candidates.length !== 1) {
    throw new Error('INVALID_TARGET: input requires one foreground key window');
  }
  return candidates[0];
}

// Called on the target App's main queue immediately before dispatch. No AX/XCTest query.
function inputContext(view = null) {
  const window = view ? view.window() : activeWindow();
  const scene = window?.windowScene();
  if (!scene || Number(scene.activationState()) !== 0) {
    throw new Error('VIEW_NOT_VISIBLE: target requires a foreground UIWindowScene');
  }
  const screen = window.screen();
  if (!screen.isEqual_(ObjC.classes.UIScreen.mainScreen())) {
    throw new Error('INVALID_TARGET: external-display input is not supported');
  }
  const space = screen.coordinateSpace();
  const screenBounds = rectValue(space.bounds());
  const appBounds = intersectBounds(rectOnScreen(window, space), screenBounds);
  const orientation = Number(scene.interfaceOrientation());
  if (!validBounds(appBounds) || ![1, 2, 3, 4].includes(orientation)) {
    throw new Error('VIEW_NOT_VISIBLE: window geometry is unavailable');
  }
  return { window, space, bounds: appBounds, orientation };
}

function viewInputTarget(view) {
  const { space, bounds: area, orientation } = inputContext(view);
  let bounds = intersectBounds(rectOnScreen(view, space), area);
  for (let ancestor = view; ancestor; ancestor = ancestor.superview()) {
    if (Boolean(ancestor.isHidden()) || Number(ancestor.alpha()) <= 0.01
        || !Boolean(ancestor.isUserInteractionEnabled())) {
      throw new Error('VIEW_NOT_VISIBLE: UIView or an ancestor cannot receive touches');
    }
    if (Boolean(ancestor.clipsToBounds())) {
      bounds = intersectBounds(bounds, rectOnScreen(ancestor, space));
    }
  }
  if (!bounds) throw new Error('VIEW_NOT_VISIBLE: UIView has no visible input area');
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  return { point: { x, y }, bounds, orientation };
}

function describeView(view) {
  const name = view.$className;
  // Diagnostics must not replace the original input error if a custom getter fails.
  try {
    const identifier = view.accessibilityIdentifier();
    return identifier ? `${name}(identifier=${JSON.stringify(String(identifier))})` : name;
  } catch (_) {
    return name;
  }
}

function requireScreenHit(view, point) {
  const targetWindow = view.window();
  const scene = targetWindow.windowScene();
  const space = targetWindow.screen().coordinateSpace();
  // UIApplication.windows documents back-to-front order, including equal-level windows.
  // Do not sort by level or substitute scene.windows/keyWindow: neither establishes that order.
  const windows = ObjC.classes.UIApplication.sharedApplication().windows();
  if (!Boolean(windows.containsObject_(targetWindow))) {
    throw new Error('INVALID_TARGET: target window is absent from the ordered App windows');
  }
  for (let i = Number(windows.count()) - 1; i >= 0; i -= 1) {
    const window = windows.objectAtIndex_(i);
    if (!window.windowScene()?.isEqual_(scene) || Boolean(window.isHidden())
        || Number(window.alpha()) <= 0.01 || !Boolean(window.isUserInteractionEnabled())) continue;
    const local = window.convertPoint_fromCoordinateSpace_([point.x, point.y], space);
    const hit = window.hitTest_withEvent_(local, null);
    if (!hit) continue;
    if (hit.isEqual_(view) || hit.isDescendantOfView_(view)) return;
    const location = window.isEqual_(targetWindow) ? 'the target window' : 'another App window';
    throw new Error(`TOUCH_TARGET_MISMATCH: target ${describeView(view)} does not receive the touch at screen point (${point.x}, ${point.y}); hit ${describeView(hit)} in ${location}`);
  }
  throw new Error(`NO_TOUCH_RECEIVER: no view receives the touch at screen point (${point.x}, ${point.y}) for target ${describeView(view)} in its App scene`);
}

// Runs entirely in one App main-queue turn: lookup, visibility and screen geometry.
function prepareInputCommand(action, target, parameters = {}) {
  const { text, duration, direction, distance } = parameters;
  if (action === 'input' && (typeof text !== 'string' || text.length === 0)) {
    throw new Error('INVALID_ARGUMENT: text must be a non-empty string');
  }
  if (action === 'longPress' && (!Number.isFinite(duration) || duration <= 0)) {
    throw new Error('INVALID_ARGUMENT: duration must be a positive finite number');
  }
  if (action === 'scroll' && (!Number.isFinite(distance) || distance <= 0
      || !['up', 'down', 'left', 'right'].includes(direction))) {
    throw new Error('INVALID_ARGUMENT: scroll requires a valid direction and positive finite distance');
  }

  let resolved;
  let view;
  if (typeof target === 'string' || Array.isArray(target)) {
    try {
      if (typeof target === 'string') {
        if (!target.length) throw new Error('identifier must not be empty');
      } else requireUiPath(target);
    } catch (error) {
      throw new Error(`INVALID_TARGET: ${error.message}`);
    }
    view = findUiView(target);
    if (!view) throw new Error('ELEMENT_NOT_FOUND: UI target did not match a UIView');
    resolved = viewInputTarget(view);
  } else if (target && typeof target.isKindOfClass_ === 'function'
      && Boolean(target.isKindOfClass_(ObjC.classes.UIView))) {
    view = target;
    resolved = viewInputTarget(view);
  } else if (target && typeof target === 'object' && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    const { bounds, orientation } = inputContext();
    resolved = { point: requirePoint({ x: target.x, y: target.y }, bounds), bounds, orientation };
  } else {
    throw new Error('INVALID_TARGET: expected an identifier, UI path, UIView, or {x, y}');
  }

  const command = { action, ...resolved, ...parameters,
    ...(action === 'scroll'
      ? { gesture: scrollCoordinates(resolved.bounds, resolved.point, direction, distance) } : {}),
  };
  if (view) requireScreenHit(view, command.gesture
    ? { x: command.gesture.startX, y: command.gesture.startY } : command.point);
  return command;
}

export { prepareInputCommand };
