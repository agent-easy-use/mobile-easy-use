import ObjC from 'frida-objc-bridge';

const NATIVE_QUERY_CLASS = 'MEUUIQuery';
const PATH_STEP_TYPES = new Set(['identifier', 'label', 'class']);

function parsePathStep(step) {
  if (typeof step !== 'string') {
    throw new Error(
      'INVALID_TARGET: UI path steps must be identifier::, label:: or class:: strings; '
      + 'JavaScript getters are not supported by the native query bridge',
    );
  }
  const separatorIndex = step.indexOf('::');
  if (separatorIndex <= 0 || separatorIndex + 2 >= step.length) {
    throw new Error(`INVALID_TARGET: Invalid UI path step: ${step}`);
  }
  const type = step.slice(0, separatorIndex);
  if (!PATH_STEP_TYPES.has(type)) {
    throw new Error(`INVALID_TARGET: Unsupported native UI path step: ${type}`);
  }
  return step;
}

function requireUiPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('INVALID_TARGET: UI path must be a non-empty array');
  }
  path.forEach(parsePathStep);
  return path;
}

function normalizeUiPath(target) {
  if (typeof target === 'string') {
    if (target.length === 0) {
      throw new Error('INVALID_TARGET: UI identifier must not be empty');
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
  if (!query || typeof query.findUIView_ !== 'function') {
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

export { findUiView };
