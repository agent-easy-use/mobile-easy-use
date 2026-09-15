import ObjC from 'frida-objc-bridge';
import { rectValue } from '../common/geometry.js';
import { runOnMainThread } from '../common/main-thread.js';
import { findUiView } from './index.js';

export const UI_STATES = ['exists', 'visible', 'hidden', 'focused', 'enabled'];

export async function checkUiState(target, state) {
  if (!UI_STATES.includes(state)) throw new TypeError(`Unknown UI state: ${state}`);
  return runOnMainThread(() => checkUiStateNow(findUiView(target), state));
}

function intersect(left, right) {
  const leftEdge = Math.max(left.x, right.x);
  const topEdge = Math.max(left.y, right.y);
  return {
    x: leftEdge,
    y: topEdge,
    width: Math.min(left.x + left.width, right.x + right.width) - leftEdge,
    height: Math.min(left.y + left.height, right.y + right.height) - topEdge,
  };
}

function boundsOnScreen(view, window) {
  const bounds = view.convertRect_toView_(view.bounds(), window);
  return rectValue(window.convertRect_toWindow_(bounds, NULL));
}

function isVisible(view) {
  const window = view.window();
  if (window === null) return false;
  const bounds = rectValue(view.bounds());
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  let region = intersect(boundsOnScreen(view, window), boundsOnScreen(window, window));
  region = intersect(region, rectValue(window.screen().bounds()));
  let alpha = 1;
  let ancestor = view;
  while (ancestor !== null) {
    if (ancestor.isHidden()) return false;
    alpha *= ancestor.alpha();
    if (alpha <= 0.01) return false;
    if (ancestor.clipsToBounds()) {
      const ancestorBounds = rectValue(ancestor.bounds());
      if (ancestorBounds.width <= 0 || ancestorBounds.height <= 0) return false;
      region = intersect(region, boundsOnScreen(ancestor, window));
    }
    if (region.width <= 0 || region.height <= 0) return false;
    ancestor = ancestor.superview();
  }
  return true;
}

export function checkUiStateNow(view, state) {
  if (view === null) return false;
  switch (state) {
    case 'exists': return true;
    case 'visible': return isVisible(view);
    case 'hidden': return !isVisible(view);
    case 'focused': return Boolean(view.isFirstResponder());
    case 'enabled':
      if (!view.isKindOfClass_(ObjC.classes.UIControl)) {
        throw new Error('toBeEnabled requires a UIControl on iOS');
      }
      return Boolean(view.isEnabled());
    default: throw new Error(`Unknown UI state: ${state}`);
  }
}
