import Java from 'frida-java-bridge';
import { findUiView } from './query.js';

// Called on the UI thread. Invalid targets throw; unmatched locators return null.
export function resolveView(target) {
  if (typeof target === 'number' || Array.isArray(target)) return findUiView(target);
  if (target && typeof target === 'object' && '$h' in target
      && Java.use('android.view.View').class.isInstance(target)) {
    return Java.cast(target, Java.use(target.$className));
  }
  throw new TypeError('UI target must be a resource ID, UI path, or native View');
}
