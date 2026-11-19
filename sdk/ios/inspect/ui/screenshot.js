import ObjC from 'frida-objc-bridge';
import { runOnMainThread } from '../../common/main-thread.js';
import { requestController } from '../../../common/controller.js';
import { resolveView } from '../../element/target.js';
import { rect, pixels, windowFor } from './layout.js';

const active = new Set();
async function capture(target, useTarget, highlightTraget = true) {
  if (typeof highlightTraget !== 'boolean') throw new TypeError('highlightTraget must be a boolean');
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
        if (Number(artifacts.count()) !== 1) throw new Error('Expected one window screenshot');
        const data = artifacts.objectAtIndex_(0).objectForKey_('data');
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
        targetBounds: view && highlightTraget ? pixels(rect(view.convertRect_toView_(view.bounds(), window)), scale) : null };
      const bridge = ObjC.classes.MEUScreenshot;
      if (!bridge?.captureWindow_quality_completion_) throw new Error('Rebuild MobileEasyUse.dylib for inspect.ui screenshots');
      bridge.captureWindow_quality_completion_(window, 0.85, completion);
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
export const screenshot = (target, highlightTraget = true) => capture(target, true, highlightTraget);
export const screenshotWindow = () => capture(undefined, false);
