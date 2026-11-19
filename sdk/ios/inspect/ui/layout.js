import { runOnMainThread } from '../../common/main-thread.js';
import { rectValue } from '../../common/geometry.js';
import { resolveView } from '../../element/target.js';

export function rect(rectangle) {
  const value = rectValue(rectangle);
  if (!value) throw new Error('Invalid UIKit rectangle');
  return value;
}
export function pixels(rectangle, scale) {
  return Object.fromEntries(Object.entries(rectangle).map(([key, value]) => [key, value * scale]));
}
export function windowFor(view) {
  const window = view.window();
  if (window === null) throw new Error('UIView is not attached to a window');
  return window;
}
export function scaleFor(view) {
  const scale = Number(windowFor(view).screen().scale());
  if (!(scale > 0)) throw new Error('UIView screen scale is unavailable');
  return scale;
}
export async function layout(target) {
  return runOnMainThread(() => {
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    const scale = scaleFor(view);
    return { bounds: pixels(rect(view.bounds()), scale), unit: 'px', scale };
  });
}
async function relative(target, space) {
  return runOnMainThread(() => {
    const view = resolveView(target);
    if (view === null) throw new Error('UI target was not found');
    const scale = scaleFor(view);
    let destination;
    if (space === 'parent') destination = view.superview();
    else if (space === 'window') destination = windowFor(view);
    else destination = windowFor(view).screen().coordinateSpace();
    if (destination === null) throw new Error('UIView parent is unavailable');
    const targetBounds = space === 'screen'
      ? view.convertRect_toCoordinateSpace_(view.bounds(), destination)
      : view.convertRect_toView_(view.bounds(), destination);
    return { bounds: pixels(rect(destination.bounds()), scale),
      targetBounds: pixels(rect(targetBounds), scale), unit: 'px', scale };
  });
}
export const layoutInParent = target => relative(target, 'parent');
export const layoutInWindow = target => relative(target, 'window');
export const layoutInScreen = target => relative(target, 'screen');
