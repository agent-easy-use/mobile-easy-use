import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import jpeg from 'jpeg-js';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

async function readImage(filePath) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    throw new TypeError('Screenshot paths must be absolute Host paths');
  }
  const buffer = await readFile(filePath);
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return PNG.sync.read(buffer);
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return jpeg.decode(buffer, { useTArray: true, tolerantDecoding: false });
  }
  throw new Error(`Expected a PNG or JPEG screenshot: ${filePath}`);
}

export async function compareScreenshot(actualPath, baselinePath, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => key !== 'maxDiffPixelRatio')) {
    throw new TypeError('Screenshot options may only contain maxDiffPixelRatio');
  }
  const { maxDiffPixelRatio = 0 } = options;
  if (!Number.isFinite(maxDiffPixelRatio) || maxDiffPixelRatio < 0 || maxDiffPixelRatio > 1) {
    throw new TypeError('maxDiffPixelRatio must be a number in [0, 1]');
  }
  const [actual, baseline] = await Promise.all([readImage(actualPath), readImage(baselinePath)]);
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      matches: false,
      diffPixelRatio: null,
      message: `Screenshot size ${actual.width}x${actual.height} differs from baseline ${baseline.width}x${baseline.height}`,
    };
  }
  const diffPixels = pixelmatch(actual.data, baseline.data, null, actual.width, actual.height, {
    threshold: 0.2,
  });
  const diffPixelRatio = diffPixels / (actual.width * actual.height);
  return {
    matches: diffPixelRatio <= maxDiffPixelRatio,
    diffPixelRatio,
    message: `Screenshot difference ratio ${diffPixelRatio}; allowed ${maxDiffPixelRatio}`,
  };
}
