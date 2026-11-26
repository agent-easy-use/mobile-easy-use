import Java from 'frida-java-bridge';
import { runOnMainThread } from '../../common/main-thread.js';
import { resolveView } from '../../element/target.js';

export function localBounds(view) {
  return { x: 0, y: 0, width: Number(view.getWidth()), height: Number(view.getHeight()) };
}

function info(view) {
  const density = Number(view.getResources().getDisplayMetrics().density.value);
  if (!(density > 0)) throw new Error('View density is unavailable');
  return { unit: 'px', density };
}

function mapped(view, matrix) {
  const rect = Java.use('android.graphics.RectF').$new(0, 0, view.getWidth(), view.getHeight());
  matrix.mapRect(rect);
  const x = Number(rect.left.value), y = Number(rect.top.value);
  return { x, y, width: Number(rect.right.value) - x, height: Number(rect.bottom.value) - y };
}

// Global matrices use the same root coordinate frame. Converting with the inverse
// destination matrix preserves rotations/scales rather than transforming an AABB twice.
function globalMatrix(view) {
  const matrix = Java.use('android.graphics.Matrix').$new();
  view.transformMatrixToGlobal(matrix);
  return matrix;
}

export function boundsInView(view, destination) {
  const inverse = Java.use('android.graphics.Matrix').$new();
  if (!globalMatrix(destination).invert(inverse)) throw new Error('Destination transform is not invertible');
  const matrix = Java.use('android.graphics.Matrix').$new();
  matrix.setConcat(inverse, globalMatrix(view));
  return mapped(view, matrix);
}

export function windowGeometry(view) {
  if (!view.isAttachedToWindow()) throw new Error('View is not attached to a window');
  const root = view.getRootView();
  return { root, bounds: localBounds(root), targetBounds: boundsInView(view, root) };
}

export async function layout(target) {
  return runOnMainThread(() => {
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    return { bounds: localBounds(view), ...info(view) };
  });
}

export async function layoutInParent(target) {
  return runOnMainThread(() => {
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    const parent = view.getParent();
    const View = Java.use('android.view.View');
    if (parent === null || !View.class.isInstance(parent)) throw new Error('View parent is unavailable');
    const container = Java.cast(parent, View);
    return { bounds: localBounds(container), targetBounds: boundsInView(view, container), ...info(view) };
  });
}

export async function layoutInWindow(target) {
  return runOnMainThread(() => {
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    const { root, bounds, targetBounds } = windowGeometry(view);
    const offset = Java.array('int', [0, 0]);
    root.getLocationInWindow(offset);
    return { bounds: { ...bounds, x: Number(offset[0]), y: Number(offset[1]) },
      targetBounds: { ...targetBounds, x: targetBounds.x + Number(offset[0]), y: targetBounds.y + Number(offset[1]) },
      ...info(view) };
  });
}

export async function layoutInScreen(target) {
  return runOnMainThread(() => {
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    if (!view.isAttachedToWindow()) throw new Error('View is not attached to a window');
    const display = view.getDisplay();
    if (display === null) throw new Error('View display is unavailable');
    const size = Java.use('android.graphics.Point').$new();
    display.getRealSize(size);
    const root = view.getRootView();
    const matrix = globalMatrix(view);
    const rootMatrix = globalMatrix(root);
    const origin = Java.array('float', [0, 0]);
    rootMatrix.mapPoints(origin);
    const location = Java.array('int', [0, 0]);
    root.getLocationOnScreen(location);
    matrix.postTranslate(Number(location[0]) - Number(origin[0]), Number(location[1]) - Number(origin[1]));
    return { bounds: { x: 0, y: 0, width: Number(size.x.value), height: Number(size.y.value) },
      targetBounds: mapped(view, matrix), ...info(view) };
  });
}
