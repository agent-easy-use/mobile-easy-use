import Java from 'frida-java-bridge';
import { runOnMainThread } from '../../common/main-thread.js';
import { findFocusedRootView } from '../../element/query.js';
import { requestController } from '../../../common/controller.js';
import { resolveView } from '../../element/target.js';
import { windowGeometry, localBounds } from './layout.js';

let callback;
let sequence = 0;
const pending = new Map();
function decodeBase64(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const text = String(value), result = new Uint8Array(text.length / 4 * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
  let index = 0;
  for (let i = 0; i < text.length; i += 4) {
    const bits = (alphabet.indexOf(text[i]) << 18) | (alphabet.indexOf(text[i + 1]) << 12)
      | ((text[i + 2] === '=' ? 0 : alphabet.indexOf(text[i + 2])) << 6)
      | (text[i + 3] === '=' ? 0 : alphabet.indexOf(text[i + 3]));
    for (const shift of [16, 8, 0]) if (index < result.length) result[index++] = (bits >> shift) & 255;
  }
  return result.buffer;
}
function getCallback() {
  if (callback) return callback;
  const Bridge = Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot');
  const Callback = Java.registerClass({
    name: `com.agenteasyuse.mobileeasyuse.internal.InspectScreenshot${Date.now()}${Math.floor(Math.random() * 1e9)}`,
    implements: [Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot$ScreenshotCallback')],
    methods: {
      onComplete(id, result) {
        const task = pending.get(String(id));
        if (!task) return;
        pending.delete(String(id));
        clearTimeout(task.timer);
        try {
          const map = Java.cast(result, Java.use('java.util.Map'));
          const ok = Java.cast(map.get('ok'), Java.use('java.lang.Boolean')).booleanValue();
          if (!ok) throw new Error(String(map.get('error')));
          const artifacts = Java.cast(map.get('artifacts'), Java.use('java.util.List'));
          if (artifacts.size() !== 1) throw new Error('Expected one window screenshot');
          const artifact = Java.cast(artifacts.get(0), Java.use('java.util.Map'));
          task.resolve(decodeBase64(Bridge.artifactDataBase64(artifact)));
        } catch (error) { task.reject(error); }
      },
    },
  });
  callback = Java.retain(Callback.$new());
  return callback;
}
async function capture(target, useTarget, highlightTraget = true) {
  if (typeof highlightTraget !== 'boolean') throw new TypeError('highlightTraget must be a boolean');
  let metadata;
  const blob = await new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error('Screenshot capture timed out'));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    runOnMainThread(() => {
      const view = useTarget ? resolveView(target) : null;
      if (useTarget && view === null) throw new Error('UI target was not found');
      const geometry = view ? windowGeometry(view) : null;
      const root = geometry ? geometry.root : findFocusedRootView();
      if (!root || !root.isAttachedToWindow()) throw new Error('App window is unavailable');
      const bounds = localBounds(root);
      if (bounds.width <= 0 || bounds.height <= 0) throw new Error('App window has empty bounds');
      const location = Java.array('int', [0, 0]);
      root.getLocationOnScreen(location);
      metadata = { capturedAt: new Date().toISOString(), captureMethod: 'view-draw',
        density: Number(root.getResources().getDisplayMetrics().density.value),
        region: { ...bounds, x: Number(location[0]), y: Number(location[1]) },
        sourceBounds: bounds, targetBounds: highlightTraget ? geometry?.targetBounds ?? null : null };
      Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot').captureAsync(
        id, root, Java.use('java.util.LinkedHashMap').$new(), true, 85, getCallback(),
      );
    }).catch(error => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      reject(error);
    });
  });
  const response = await requestController('screenshot.annotate', { ...metadata, blob });
  if (!response.ok) throw new Error(response.responsePayload?.error?.message ?? 'Screenshot processing failed');
  return response.responsePayload;
}
export const screenshot = (target, highlightTraget = true) => capture(target, true, highlightTraget);
export const screenshotWindow = () => capture(undefined, false);
