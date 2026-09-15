import Java from 'frida-java-bridge';
import { runOnMainThread } from '../common/main-thread.js';
import { findUiView } from './ui.js';

export const UI_STATES = ['exists', 'visible', 'hidden', 'focused', 'enabled'];

export async function checkUiState(target, state) {
  if (!UI_STATES.includes(state)) throw new TypeError(`Unknown UI state: ${state}`);
  return runOnMainThread(() => checkUiStateNow(findUiView(target), state));
}

function isVisible(view) {
  if (!view.isAttachedToWindow() || !view.isShown() || view.getWindowVisibility() !== 0) return false;
  const View = Java.use('android.view.View');
  let alpha = 1;
  let ancestor = view;
  while (ancestor !== null) {
    alpha *= ancestor.getAlpha();
    if (alpha <= 0.01) return false;
    const parent = ancestor.getParent();
    ancestor = parent !== null && View.class.isInstance(parent) ? Java.cast(parent, View) : null;
  }
  const Rect = Java.use('android.graphics.Rect');
  const visibleRect = Rect.$new();
  if (!view.getGlobalVisibleRect(visibleRect)) return false;
  const rootLocation = Java.array('int', [0, 0]);
  view.getRootView().getLocationOnScreen(rootLocation);
  visibleRect.offset(rootLocation[0], rootLocation[1]);
  const displayFrame = Rect.$new();
  view.getWindowVisibleDisplayFrame(displayFrame);
  return Boolean(visibleRect.intersect(displayFrame));
}

export function checkUiStateNow(view, state) {
  if (view === null) return false;
  switch (state) {
    case 'exists': return true;
    case 'visible': return isVisible(view);
    case 'hidden': return !isVisible(view);
    case 'focused': return Boolean(view.isFocused());
    case 'enabled': return Boolean(view.isEnabled());
    default: throw new Error(`Unknown UI state: ${state}`);
  }
}
