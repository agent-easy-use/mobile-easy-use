import { runOnMainThread } from '../common/main-thread.js';
import { inputClick } from './input/click.js';
import { inputLongPress } from './input/longpress.js';
import { inputIntoTarget } from './input/input.js';
import { inputScroll } from './input/scroll.js';
import { waitForUi, waitUntil } from './wait.js';

// Input resolves its target before the first await. Schedule that phase on main;
// the returned Promise does not block the main thread during gesture completion.
export const drive = Object.freeze({
  click: target => runOnMainThread(() => inputClick(target)),
  longPress: target => runOnMainThread(() => inputLongPress(target)),
  input: (target, text) => runOnMainThread(() => inputIntoTarget(target, text)),
  scroll: (target, direction) => runOnMainThread(() => inputScroll(target, direction)),
  wait: waitForUi,
  waitUntil,
});
