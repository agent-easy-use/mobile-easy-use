import Java from 'frida-java-bridge';
import { requestController } from '../../common/controller.js';
import { errorMessage, runOnMainThread } from '../common/index.js';
import { findFocusedRootView, findUiView } from './ui.js';

const JPEG_QUALITY = 85;
const CAPTURE_TIMEOUT_MS = 10000;
const FILE_WRITE_TIMEOUT_MS = 10000;

function javaValue(map, key) {
  try {
    return map?.get?.(key) ?? null;
  } catch (_) {
    return null;
  }
}

function booleanValue(value) {
  try {
    return typeof value?.booleanValue === 'function'
      ? Boolean(value.booleanValue())
      : Boolean(value);
  } catch (_) {
    return false;
  }
}

function stringValue(value) {
  return value == null ? null : String(value);
}

function base64ArrayBuffer(value) {
  const encoded = String(value ?? '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(Math.max(0, Math.floor(encoded.length * 3 / 4) - padding));
  let outputIndex = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const a = alphabet.indexOf(encoded[index]);
    const b = alphabet.indexOf(encoded[index + 1]);
    const c = encoded[index + 2] === '=' ? 0 : alphabet.indexOf(encoded[index + 2]);
    const d = encoded[index + 3] === '=' ? 0 : alphabet.indexOf(encoded[index + 3]);
    const value24 = (a << 18) | (b << 12) | (c << 6) | d;
    if (outputIndex < bytes.length) bytes[outputIndex++] = value24 >> 16;
    if (outputIndex < bytes.length) bytes[outputIndex++] = value24 >> 8;
    if (outputIndex < bytes.length) bytes[outputIndex++] = value24;
  }
  return bytes.buffer;
}

function normalizeOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('AndroidExp.screenshot options must be an object');
  }
  const unsupported = Object.keys(options).find(
    (key) => key !== 'targets' && key !== 'includeWindow',
  );
  if (unsupported !== undefined) {
    throw new Error(`AndroidExp.screenshot does not support option: ${unsupported}`);
  }
  const targets = options.targets ?? {};
  if (targets === null || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new Error('AndroidExp.screenshot targets must map uiKey to an Android UI target');
  }
  const targetEntries = Object.entries(targets);
  for (const [uiKey] of targetEntries) {
    if (uiKey.length === 0) throw new Error('Screenshot uiKey must not be empty');
  }
  if (options.includeWindow !== undefined && typeof options.includeWindow !== 'boolean') {
    throw new Error('AndroidExp.screenshot includeWindow must be a boolean');
  }
  return {
    targets,
    targetEntries,
    includeWindow: targetEntries.length === 0 || options.includeWindow === true,
  };
}

function resolveTarget(target) {
  if (typeof target === 'number' || Array.isArray(target)) return findUiView(target);
  if (target !== null && typeof target === 'object') return target;
  throw new Error('Screenshot target must be a resource ID, UI path, or Android View');
}

function copyCapturedImages(screenshotBridge, captured, normalized) {
  if (!booleanValue(javaValue(captured, 'ok'))) {
    throw new Error(stringValue(javaValue(captured, 'error')) ?? 'Screenshot capture failed');
  }

  const artifactsValue = javaValue(captured, 'artifacts');
  const artifacts = artifactsValue
    ? Java.cast(artifactsValue, Java.use('java.util.List'))
    : null;
  const images = [];
  const size = Number(artifacts?.size?.() ?? 0);
  for (let index = 0; index < size; index += 1) {
    const artifact = Java.cast(artifacts.get(index), Java.use('java.util.Map'));
    const scope = stringValue(javaValue(artifact, 'scope'));
    const uiKey = stringValue(javaValue(artifact, 'uiKey'));
    if (scope === 'window' && !normalized.includeWindow) continue;
    if (scope === 'element' && !Object.hasOwn(normalized.targets, uiKey)) continue;
    images.push({
      scope,
      uiKey,
      encoded: String(screenshotBridge.artifactDataBase64(artifact)),
    });
  }
  return images;
}

let captureSequence = 0;
let screenshotCallback = null;
const pendingCaptures = new Map();

function getScreenshotCallback() {
  if (screenshotCallback !== null) return screenshotCallback;
  const ScreenshotCallback = Java.use(
    'com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot$ScreenshotCallback',
  );
  const callbackClassSuffix = `${Date.now()}${Math.floor(Math.random() * 1000000000)}`;
  const callbackClass = Java.registerClass({
    name: `com.agenteasyuse.mobileeasyuse.internal.FridaScreenshotCallback${callbackClassSuffix}`,
    implements: [ScreenshotCallback],
    methods: {
      onComplete(requestIdValue, captured) {
        const requestId = String(requestIdValue);
        const pending = pendingCaptures.get(requestId);
        if (pending === undefined) return;
        pendingCaptures.delete(requestId);
        clearTimeout(pending.timer);
        try {
          pending.resolve(copyCapturedImages(pending.bridge, captured, pending.normalized));
        } catch (error) {
          pending.reject(error);
        }
      },
    },
  });
  screenshotCallback = Java.retain(callbackClass.$new());
  return screenshotCallback;
}

function captureImages(normalized) {
  const screenshotBridge = Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot');
  const callback = getScreenshotCallback();
  const requestId = `${Date.now()}-${++captureSequence}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pendingCaptures.delete(requestId)) return;
      reject(new Error('Screenshot capture timed out'));
    }, CAPTURE_TIMEOUT_MS);
    pendingCaptures.set(requestId, {
      bridge: screenshotBridge,
      normalized,
      resolve,
      reject,
      timer,
    });
    runOnMainThread(() => {
      const root = findFocusedRootView();
      if (!root) throw new Error('Focused App Window root is unavailable');

      const LinkedHashMap = Java.use('java.util.LinkedHashMap');
      const nativeTargets = LinkedHashMap.$new();
      const View = Java.use('android.view.View');
      for (const [uiKey, target] of normalized.targetEntries) {
        const view = resolveTarget(target);
        if (view) nativeTargets.put(uiKey, Java.cast(view, View));
      }
      screenshotBridge.captureAsync(
        requestId,
        Java.cast(root, View),
        nativeTargets,
        normalized.includeWindow,
        JPEG_QUALITY,
        callback,
      );
    }).catch((error) => {
      if (!pendingCaptures.delete(requestId)) return;
      clearTimeout(timer);
      reject(error);
    });
  });
}

let screenshotSequence = 0;

function nextOutputDirectory() {
  screenshotSequence += 1;
  const nonce = Math.random().toString(36).slice(2, 10);
  return `screenshots/${Date.now()}-${screenshotSequence}-${nonce}`;
}

async function writeImage(filePath, blob) {
  const response = await requestController(
    'file.write',
    { filePath, blob },
    FILE_WRITE_TIMEOUT_MS,
  );
  const imagePath = response.responsePayload?.filePath;
  if (response.ok !== true || typeof imagePath !== 'string' || imagePath.length === 0) {
    throw new Error(
      response.responsePayload?.error?.message ?? 'Controller failed to save screenshot',
    );
  }
  return imagePath;
}

async function persistImages(images, normalized) {
  const outputDirectory = nextOutputDirectory();
  const targets = {};
  let window;
  let targetIndex = 0;

  for (const image of images) {
    if (image.scope === 'window') {
      window = await writeImage(`${outputDirectory}/window.jpg`, base64ArrayBuffer(image.encoded));
      continue;
    }
    if (image.scope !== 'element' || typeof image.uiKey !== 'string') continue;
    const imagePath = await writeImage(
      `${outputDirectory}/target-${targetIndex++}.jpg`,
      base64ArrayBuffer(image.encoded),
    );
    Object.defineProperty(targets, image.uiKey, {
      value: imagePath,
      enumerable: true,
      configurable: true,
    });
  }

  if (normalized.includeWindow && window === undefined) {
    throw new Error('Screenshot capture returned no App Window image');
  }
  return { ok: true, ...(window === undefined ? {} : { window }), targets };
}

async function screenshot(options = {}) {
  try {
    const normalized = normalizeOptions(options);
    const images = await captureImages(normalized);
    return await persistImages(images, normalized);
  } catch (error) {
    return { ok: false, error: { message: errorMessage(error) }, targets: {} };
  }
}

export { screenshot };
