import ObjC from 'frida-objc-bridge';
import { requestController } from '../common/controller.js';
import { errorMessage } from './common/reporting.js';
import { runOnMainThread } from './common/main-thread.js';
import { findUiView } from './ui/index.js';

const JPEG_QUALITY = 0.85;
const FILE_WRITE_TIMEOUT_MS = 10000;

function dictionaryValue(dictionary, key) {
  try {
    return dictionary?.objectForKey_?.(key) ?? null;
  } catch (_) {
    return null;
  }
}

function boolValue(value) {
  try {
    return typeof value?.boolValue === 'function' ? Boolean(value.boolValue()) : Boolean(value);
  } catch (_) {
    return false;
  }
}

function stringValue(value) {
  return value == null ? null : String(value);
}

function dataBuffer(data) {
  const length = Number(data?.length?.() ?? 0);
  if (!(length > 0)) return new ArrayBuffer(0);
  return data.bytes().readByteArray(length);
}

function normalizeOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('IOS.screenshot options must be an object');
  }
  const unsupported = Object.keys(options).find(
    (key) => key !== 'targets' && key !== 'includeWindow',
  );
  if (unsupported !== undefined) {
    throw new Error(`IOS.screenshot does not support option: ${unsupported}`);
  }
  const targets = options.targets ?? {};
  if (targets === null || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new Error('IOS.screenshot targets must map uiKey to an identifier or UI path');
  }
  const targetEntries = Object.entries(targets);
  for (const [uiKey] of targetEntries) {
    if (uiKey.length === 0) throw new Error('Screenshot uiKey must not be empty');
  }
  if (options.includeWindow !== undefined && typeof options.includeWindow !== 'boolean') {
    throw new Error('IOS.screenshot includeWindow must be a boolean');
  }
  return {
    targets,
    targetEntries,
    includeWindow: targetEntries.length === 0 || options.includeWindow === true,
  };
}

function copyCapturedImages(captured, normalized) {
  if (!boolValue(dictionaryValue(captured, 'ok'))) {
    throw new Error(stringValue(dictionaryValue(captured, 'error')) ?? 'Screenshot capture failed');
  }
  if (!boolValue(dictionaryValue(captured, 'complete'))) {
    throw new Error('Screenshot capture was incomplete');
  }

  const nativeArtifacts = dictionaryValue(captured, 'artifacts');
  const images = [];
  const count = Number(nativeArtifacts?.count?.() ?? 0);
  for (let index = 0; index < count; index += 1) {
    const artifact = nativeArtifacts.objectAtIndex_(index);
    const scope = stringValue(dictionaryValue(artifact, 'scope'));
    const uiKey = stringValue(dictionaryValue(artifact, 'uiKey'));
    if (scope === 'window' && !normalized.includeWindow) continue;
    if (scope === 'element' && !Object.hasOwn(normalized.targets, uiKey)) continue;
    images.push({
      scope,
      uiKey,
      blob: dataBuffer(dictionaryValue(artifact, 'data')),
    });
  }
  return images;
}

const activeScreenshotBlocks = new Set();

function captureImages(normalized) {
  const bridge = ObjC.classes.MEUScreenshot;
  if (!bridge?.captureWindowWithTargets_includeWindow_quality_completion_) {
    return Promise.reject(
      new Error('MEUScreenshot is unavailable; rebuild and load MobileEasyUse.dylib'),
    );
  }

  return new Promise((resolve, reject) => {
    let completion;
    completion = new ObjC.Block({
      retType: 'void',
      argTypes: ['object'],
      implementation(capturedValue) {
        activeScreenshotBlocks.delete(completion);
        try {
          const captured = typeof capturedValue?.objectForKey_ === 'function'
            ? capturedValue
            : new ObjC.Object(capturedValue);
          resolve(copyCapturedImages(captured, normalized));
        } catch (error) {
          reject(error);
        }
      },
    });
    activeScreenshotBlocks.add(completion);

    runOnMainThread(() => {
      const nativeTargets = ObjC.classes.NSMutableDictionary.dictionary();
      for (const [uiKey, target] of normalized.targetEntries) {
        const view = findUiView(target);
        if (view) nativeTargets.setObject_forKey_(view, uiKey);
      }
      bridge.captureWindowWithTargets_includeWindow_quality_completion_(
        nativeTargets,
        normalized.includeWindow,
        JPEG_QUALITY,
        completion,
      );
    }).catch((error) => {
      activeScreenshotBlocks.delete(completion);
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
      window = await writeImage(`${outputDirectory}/window.jpg`, image.blob);
      continue;
    }
    if (image.scope !== 'element' || typeof image.uiKey !== 'string') continue;
    const imagePath = await writeImage(
      `${outputDirectory}/target-${targetIndex++}.jpg`,
      image.blob,
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
