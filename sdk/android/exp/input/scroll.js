import {
  delay,
  getDisplayBounds,
  injectMotionEvent,
  resolveInputTarget,
  runInputAction,
  uptimeMillis,
} from './utils.js';

async function performScroll(startX, startY, endX, endY, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('INVALID_ARGUMENT: durationMillis must be non-negative');
  }
  const downTime = uptimeMillis();
  const steps = Math.min(120, Math.max(2, Math.ceil(durationMs / 16)));
  let downInjected = false;
  try {
    injectMotionEvent(downTime, downTime, 0, startX, startY);
    downInjected = true;
    for (let index = 1; index < steps; index += 1) {
      const progress = index / steps;
      await delay(durationMs / steps);
      injectMotionEvent(
        downTime,
        uptimeMillis(),
        2,
        startX + ((endX - startX) * progress),
        startY + ((endY - startY) * progress),
      );
    }
    await delay(durationMs / steps);
    injectMotionEvent(downTime, uptimeMillis(), 1, endX, endY);
    downInjected = false;
    return { startX, startY, endX, endY, durationMillis: durationMs, displayId: 0, injectedEvents: steps + 1 };
  } finally {
    if (downInjected) {
      try {
        injectMotionEvent(downTime, uptimeMillis(), 3, endX, endY);
      } catch (_) {
      }
    }
  }
}

function calculateScrollGesture(target, direction) {
  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    throw new Error('INVALID_ARGUMENT: direction must be up, down, left, or right');
  }
  const resolved = resolveInputTarget(target);
  const display = getDisplayBounds();
  const bounds = resolved.bounds ?? { left: 0, top: 0, right: display.width, bottom: display.height };
  const visibleBounds = {
    left: Math.max(0, bounds.left),
    top: Math.max(0, bounds.top),
    right: Math.min(display.width, bounds.right),
    bottom: Math.min(display.height, bounds.bottom),
  };
  const horizontal = direction === 'left' || direction === 'right';
  const span = horizontal
    ? visibleBounds.right - visibleBounds.left
    : visibleBounds.bottom - visibleBounds.top;
  if (span < 2) {
    throw new Error('VIEW_NOT_VISIBLE: target has no scrollable visible area');
  }
  const requestedDistance = span * 0.6;
  const half = Math.min(requestedDistance, Math.max(1, span - 2)) / 2;
  let { x: startX, y: startY } = resolved;
  let { x: endX, y: endY } = resolved;
  if (direction === 'up') {
    startY += half;
    endY -= half;
  } else if (direction === 'down') {
    startY -= half;
    endY += half;
  } else if (direction === 'left') {
    startX += half;
    endX -= half;
  } else {
    startX -= half;
    endX += half;
  }
  const clamp = (value, minimum, maximum) => Math.min(maximum - 1, Math.max(minimum, value));
  return {
    startX: clamp(startX, visibleBounds.left, visibleBounds.right),
    endX: clamp(endX, visibleBounds.left, visibleBounds.right),
    startY: clamp(startY, visibleBounds.top, visibleBounds.bottom),
    endY: clamp(endY, visibleBounds.top, visibleBounds.bottom),
    targetType: resolved.targetType,
    resourceId: resolved.resourceId,
  };
}

function inputScroll(target, direction) {
  return runInputAction('scroll', async () => {
    const gesture = calculateScrollGesture(target, direction);
    const result = await performScroll(
      gesture.startX,
      gesture.startY,
      gesture.endX,
      gesture.endY,
      300,
    );
    return { ...result, direction, targetType: gesture.targetType, resourceId: gesture.resourceId };
  });
}

export { inputScroll };
