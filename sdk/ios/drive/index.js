import { click, input, longPress, scroll } from './input/index.js';
import { waitForUi, waitUntil } from './wait.js';

export const drive = Object.freeze({
  input: Object.freeze({ click, input, longPress, scroll }),
  wait: Object.freeze({ ui: waitForUi, until: waitUntil }),
});
