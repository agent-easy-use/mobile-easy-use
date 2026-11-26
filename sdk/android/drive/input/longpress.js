import {
  performPress,
  resolveInputTarget,
  runInputAction,
} from './utils.js';

function inputLongPress(target) {
  return runInputAction('longPress', async () => {
    const resolved = resolveInputTarget(target);
    const result = await performPress(resolved.x, resolved.y, 600);
    return { ...result, durationMs: 600, targetType: resolved.targetType, resourceId: resolved.resourceId };
  });
}

export { inputLongPress };
