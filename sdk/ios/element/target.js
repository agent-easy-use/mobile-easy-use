import ObjC from 'frida-objc-bridge';
import { findUiView } from './query.js';

// Called on the main queue. Invalid targets throw; unmatched locators return null.
export function resolveView(target) {
  if (typeof target === 'string' || Array.isArray(target)) return findUiView(target);
  if (target && typeof target === 'object' && target.handle
      && typeof target.isKindOfClass_ === 'function'
      && target.isKindOfClass_(ObjC.classes.UIView)) return target;
  throw new TypeError('UI target must be an identifier, UI path, or native UIView');
}
