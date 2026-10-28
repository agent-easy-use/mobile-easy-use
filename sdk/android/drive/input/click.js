import {
  performPress,
  resolveInputTarget,
  runInputAction,
} from './utils.js';

function inputClick(target) {
  return runInputAction('click', async () => {
    const resolved = resolveInputTarget(target);
    const result = await performPress(resolved.x, resolved.y, 16);
    return { ...result, targetType: resolved.targetType, resourceId: resolved.resourceId };
  });
}

export { inputClick };
