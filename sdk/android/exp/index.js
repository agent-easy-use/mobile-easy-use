import { runOnMainThread } from '../common/index.js';
import { inputClick } from './input/click.js';
import { inputLongPress } from './input/longpress.js';
import { inputScroll } from './input/scroll.js';
import { inputIntoTarget } from './input/input.js';
import { screenshot } from './screenshot.js';
import { waitForUi, waitUntil } from './wait.js';
import { findUiView, getRootViews } from './ui.js';

export const AndroidExp = {
  runOnMainThread,
  screenshot,
  window: {
    getRootViews,
  },
  ui: {
    find: findUiView,
  },
  input: {
    click: inputClick,
    longPress: inputLongPress,
    scroll: inputScroll,
    input: inputIntoTarget,
  },
  wait: { ui: waitForUi, until: waitUntil },
};

export { findFocusedRootView } from './ui.js';
