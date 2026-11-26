import Java from 'frida-java-bridge';
import {
  delay,
  injectInputEvent,
  performPress,
  recycleInputEvent,
  resolveInputTarget,
  runInputAction,
} from './utils.js';

function requireInputText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('INVALID_ARGUMENT: text must be a non-empty string');
  }
}

function performText(text) {
  let result;
  Java.performNow(() => {
    const keyboard = Java.use('android.view.KeyCharacterMap').load(-1);
    const events = keyboard.getEvents(Java.array('char', text.split('')));
    if (!events) {
      throw new Error('Input text cannot be represented as key events');
    }
    let injectedEvents = 0;
    for (const event of Array.from(events)) {
      try {
        if (typeof event.setDisplayId === 'function') {
          event.setDisplayId(0);
        }
        injectInputEvent(event);
        injectedEvents += 1;
      } finally {
        recycleInputEvent(event);
      }
    }
    result = { textLength: text.length, injectedEvents };
  });
  return result;
}

function inputIntoTarget(target, text) {
  return runInputAction('input', async () => {
    requireInputText(text);
    const resolved = resolveInputTarget(target);
    const press = await performPress(resolved.x, resolved.y, 16);
    await delay(50);
    const textResult = performText(text);
    return {
      x: resolved.x,
      y: resolved.y,
      displayId: press.displayId,
      targetType: resolved.targetType,
      resourceId: resolved.resourceId,
      textLength: textResult.textLength,
      injectedEvents: press.injectedEvents + textResult.injectedEvents,
    };
  });
}

export { inputIntoTarget };
