import ObjC from 'frida-objc-bridge';
import { runOnMainThread } from '../../common/main-thread.js';
import { requestController } from '../../../common/controller.js';
import { resolveView } from '../../element/target.js';
import { rect, pixels, windowFor } from './layout.js';

const active = new Set();
async function capture(target, useTarget, highlight = true, elementOnly = false) {
  if (typeof highlight !== 'boolean') throw new TypeError('highlight must be a boolean');
  let metadata;
  const blob = await new Promise((resolve, reject) => {
    let settled = false;
    // Keep the block alive until native completion even if the caller times out.
    const completion = new ObjC.Block({ retType: 'void', argTypes: ['object'], implementation(value) {
      active.delete(completion);
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      try {
        const result = new ObjC.Object(value);
        if (!result.objectForKey_('ok').boolValue()) throw new Error(String(result.objectForKey_('error')));
        if (!result.objectForKey_('complete').boolValue()) throw new Error('Window rendering was incomplete');
        const artifacts = result.objectForKey_('artifacts');
        if (Number(artifacts.count()) !== 1) throw new Error('Expected one screenshot; target may be hidden or outside the window');
        const artifact = artifacts.objectAtIndex_(0);
        if (elementOnly) {
          const bounds = artifact.objectForKey_('bounds');
          const crop = pixels(Object.fromEntries(['x', 'y', 'width', 'height'].map(key =>
            [key, Number(bounds.objectForKey_(key))])), metadata.scale);
          metadata.region = { ...crop,
            x: metadata.region.x + crop.x - metadata.sourceBounds.x,
            y: metadata.region.y + crop.y - metadata.sourceBounds.y };
          metadata.sourceBounds = crop;
        }
        const data = artifact.objectForKey_('data');
        resolve(data.bytes().readByteArray(Number(data.length())));
      } catch (error) { reject(error); }
    } });
    active.add(completion);
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Screenshot capture timed out'));
    }, 10000);
    runOnMainThread(() => {
      const view = useTarget ? resolveView(target) : null;
      if (useTarget && view === null) throw new Error('UI target was not found');
      const window = view ? windowFor(view) : ObjC.classes.MEUUIQuery.focusedWindow();
      if (!window) throw new Error('App window is unavailable');
      const bounds = rect(window.bounds()), scale = Number(window.screen().scale());
      const screen = rect(window.convertRect_toCoordinateSpace_(window.bounds(), window.screen().coordinateSpace()));
      if (!(scale > 0) || bounds.width <= 0 || bounds.height <= 0) throw new Error('App window has invalid geometry');
      metadata = { capturedAt: new Date().toISOString(), captureMethod: 'draw-view-hierarchy', scale,
        region: pixels(screen, scale), sourceBounds: pixels(bounds, scale),
        targetBounds: view && highlight ? pixels(rect(view.convertRect_toView_(view.bounds(), window)), scale) : null };
      const bridge = ObjC.classes.MEUScreenshot;
      if (!bridge?.captureWindow_quality_completion_) throw new Error('Rebuild MobileEasyUse.dylib for inspect.ui screenshots');
      if (elementOnly) {
        const targets = ObjC.classes.NSMutableDictionary.dictionary();
        targets.setObject_forKey_(view, 'element');
        bridge.captureWindow_targets_includeWindow_quality_completion_(window, targets, false, 0.85, completion);
      } else {
        bridge.captureWindow_quality_completion_(window, 0.85, completion);
      }
    }).catch(error => {
      active.delete(completion);
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
  });
  const response = await requestController('screenshot.annotate', { ...metadata, blob });
  if (!response.ok) throw new Error(response.responsePayload?.error?.message ?? 'Screenshot processing failed');
  return response.responsePayload;
}
export const screenshotElementInWindow = (target, highlight = true) => capture(target, true, highlight);
export const screenshotWindow = () => capture(undefined, false);

// Reuse the native window-render-and-crop path; this is not standalone View rendering.
export const screenshotElement = target => capture(target, true, false, true);
