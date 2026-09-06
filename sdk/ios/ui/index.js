import ObjC from 'frida-objc-bridge';
import { rectValue } from '../common/geometry.js';

const NATIVE_QUERY_CLASS = 'MEUUIQuery';
const PATH_STEP_TYPES = new Set(['identifier', 'label']);

function parsePathStep(step) {
  if (typeof step !== 'string') {
    throw new Error(
      'UI path steps must be identifier:: or label:: strings; '
      + 'JavaScript getters are not supported by the native query bridge',
    );
  }
  const separatorIndex = step.indexOf('::');
  if (separatorIndex <= 0 || separatorIndex + 2 >= step.length) {
    throw new Error(`Invalid UI path step: ${step}`);
  }
  const type = step.slice(0, separatorIndex);
  if (!PATH_STEP_TYPES.has(type)) {
    throw new Error(`Unsupported native UI path step: ${type}`);
  }
  return step;
}

function requireUiPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('UI path must be a non-empty array');
  }
  path.forEach(parsePathStep);
  return path;
}

function normalizeUiPath(target) {
  if (typeof target === 'string') {
    if (target.length === 0) {
      throw new Error('UI identifier must not be empty');
    }
    return [`identifier::${target}`];
  }
  return requireUiPath(target);
}

function nativeQueryClass() {
  if (!ObjC.available) {
    throw new Error('Objective-C runtime is unavailable');
  }
  const query = ObjC.classes[NATIVE_QUERY_CLASS];
  if (!query || typeof query.findUIView_ !== 'function'
    || typeof query.stateForUIViewPath_ !== 'function') {
    throw new Error(
      `${NATIVE_QUERY_CLASS}.findUIView: is unavailable; `
      + 'load MobileEasyUse.dylib after LLDB attaches',
    );
  }
  return query;
}

/**
 * Synchronously calls the native Objective-C query. The Objective-C method
 * owns window selection, UIView traversal, matching, and traversal limits.
 */
function findUiView(target) {
  const path = normalizeUiPath(target);
  return nativeQueryClass().findUIView_(nativePath(path));
}

function nativePath(path) {
  // Build an NSArray explicitly. This is argument marshalling only; the
  // native class owns all traversal and matching work.
  const result = ObjC.classes.NSMutableArray.array();
  path.forEach((step) => result.addObject_(step));
  return result;
}

function stateForUiView(target) {
  const path = normalizeUiPath(target);
  return nativeQueryClass().stateForUIViewPath_(nativePath(path));
}

function readString(object, methodName) {
  try {
    const method = object?.[methodName];
    if (typeof method !== 'function') return null;
    const value = method.call(object);
    return value == null ? null : String(value);
  } catch (_) {
    return null;
  }
}

function viewIsVisibleNow(view) {
  if (!view) return false;
  try {
    if (typeof view.window !== 'function' || view.window() == null) return false;
    if (typeof view.isHidden === 'function' && Boolean(view.isHidden())) return false;
    if (typeof view.alpha === 'function' && !(Number(view.alpha()) > 0.01)) return false;
    const bounds = rectValue(view.bounds());
    return bounds !== null && bounds.width > 0 && bounds.height > 0;
  } catch (_) {
    return false;
  }
}

function inspectUiViewNow(view) {
  if (!view) {
    return {
      className: null,
      value: { exist: false, visible: false, bounds: null, properties: {} },
    };
  }
  let bounds = null;
  try {
    bounds = rectValue(view.convertRect_toView_(view.bounds(), NULL));
  } catch (_) {
    try {
      bounds = rectValue(view.frame());
    } catch (_) {
    }
  }
  const properties = {
    identifier: readString(view, 'accessibilityIdentifier'),
    label: readString(view, 'accessibilityLabel'),
    value: readString(view, 'accessibilityValue'),
  };
  try {
    if (typeof view.isUserInteractionEnabled === 'function') {
      properties.userInteractionEnabled = Boolean(view.isUserInteractionEnabled());
    }
  } catch (_) {
  }
  return {
    className: view.$className ?? null,
    value: {
      exist: true,
      visible: viewIsVisibleNow(view),
      bounds,
      properties,
    },
  };
}

export {
  findUiView,
  stateForUiView,
  inspectUiViewNow,
  requireUiPath,
  viewIsVisibleNow,
};
