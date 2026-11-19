import { runOnMainThread } from '../../common/main-thread.js';
import { checkUiStateNow } from '../../element/state.js';
import { resolveView } from '../../element/target.js';
import { tree } from './tree.js';
import { layout, layoutInParent, layoutInWindow, layoutInScreen } from './layout.js';
import { screenshotElement, screenshotElementInWindow, screenshotWindow } from './screenshot.js';

const check = (target, state) => runOnMainThread(() => checkUiStateNow(resolveView(target), state));
export const ui = Object.freeze({
  isExisting: target => check(target, 'exists'),
  isVisible: target => check(target, 'visible'),
  isHidden: target => check(target, 'hidden'),
  isFocused: target => check(target, 'focused'),
  isEnabled: target => check(target, 'enabled'),
  tree, layout, layoutInParent, layoutInWindow, layoutInScreen, screenshotElement, screenshotElementInWindow, screenshotWindow,
});
