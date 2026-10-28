// Shared screen-point geometry; contains no UIKit or XCTest calls.
function validBounds(bounds) {
  return bounds && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))
    && bounds.width > 0 && bounds.height > 0;
}
function intersectBounds(a, b) {
  if (!validBounds(a) || !validBounds(b)) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
function requirePoint(point, bounds) {
  if (!validBounds(bounds) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < bounds.x || point.y < bounds.y
      || point.x >= bounds.x + bounds.width || point.y >= bounds.y + bounds.height) {
    throw new Error('INVALID_COORDINATES: point is outside the visible input area');
  }
  return point;
}
function scrollCoordinates(bounds, point, direction, distance) {
  // Public action parameters are validated by prepareInputCommand before geometry resolution.
  if (!validBounds(bounds) || bounds.width < 2 || bounds.height < 2) {
    throw new Error('VIEW_NOT_VISIBLE: target has no visible gesture area');
  }
  requirePoint(point, bounds);
  const horizontal = direction === 'left' || direction === 'right';
  const half = Math.min(distance, Math.max(1, (horizontal ? bounds.width : bounds.height) - 2)) / 2;
  const dx = direction === 'left' ? -half : direction === 'right' ? half : 0;
  const dy = direction === 'up' ? -half : direction === 'down' ? half : 0;
  const clamp = (value, low, size) => Math.max(low + 1, Math.min(low + size - 1, value));
  const result = {
    startX: clamp(point.x - dx, bounds.x, bounds.width),
    startY: clamp(point.y - dy, bounds.y, bounds.height),
    endX: clamp(point.x + dx, bounds.x, bounds.width),
    endY: clamp(point.y + dy, bounds.y, bounds.height),
  };
  if (result.startX === result.endX && result.startY === result.endY) {
    throw new Error('VIEW_NOT_VISIBLE: target has no usable scroll distance');
  }
  return result;
}
export { intersectBounds, requirePoint, scrollCoordinates, validBounds };
