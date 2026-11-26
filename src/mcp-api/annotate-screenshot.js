import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

function rectangle(value, name) {
  if (!value || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]))
      || value.width <= 0 || value.height <= 0) throw new TypeError(`${name} must be a finite, positive rectangle`);
  return value;
}

export function annotateScreenshot(buffer, targetBounds, sourceBounds, pixelsPerUnit = 1) {
  const isPNG = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJPEG = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (!isPNG && !isJPEG) throw new Error('Expected PNG or JPEG screenshot');
  const image = isPNG ? PNG.sync.read(buffer) : jpeg.decode(buffer, { useTArray: true, tolerantDecoding: false });
  rectangle(sourceBounds, 'sourceBounds');
  if (targetBounds === null) return { buffer, width: image.width, height: image.height,
    format: isPNG ? 'png' : 'jpeg', highlight: null };
  rectangle(targetBounds, 'targetBounds');
  const sx = image.width / sourceBounds.width, sy = image.height / sourceBounds.height;
  const left = Math.max(0, Math.floor((targetBounds.x - sourceBounds.x) * sx));
  const top = Math.max(0, Math.floor((targetBounds.y - sourceBounds.y) * sy));
  const right = Math.min(image.width, Math.ceil((targetBounds.x + targetBounds.width - sourceBounds.x) * sx));
  const bottom = Math.min(image.height, Math.ceil((targetBounds.y + targetBounds.height - sourceBounds.y) * sy));
  if (right <= left || bottom <= top) throw new Error('Target has no area inside the screenshot');
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) throw new TypeError('Invalid platform density/scale');
  // Total stroke is 2 dp on Android / 2 pt on iOS, including the white outline.
  const stroke = Math.max(1, Math.round(2 * pixelsPerUnit));
  const outline = Math.min(stroke - 1, Math.max(1, Math.round(0.5 * pixelsPerUnit)));
  const dash = Math.max(1, Math.round(6 * pixelsPerUnit));
  const gap = Math.max(1, Math.round(4 * pixelsPerUnit));
  const width = right - left, height = bottom - top;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const edge = Math.min(y - top, right - 1 - x, bottom - 1 - y, x - left);
      if (edge >= stroke) continue;
      const distances = [y - top, right - 1 - x, bottom - 1 - y, x - left];
      const side = distances.indexOf(edge);
      const along = [x - left, width + y - top,
        width + height + right - 1 - x, 2 * width + height + bottom - 1 - y][side];
      if (along % (dash + gap) >= dash) continue;
      const color = edge < outline ? [255, 255, 255, 255] : [255, 60, 60, 255];
      image.data.set(color, (y * image.width + x) * 4);
    }
  }
  return { buffer: PNG.sync.write(image), width: image.width, height: image.height, format: 'png',
    highlight: { x: left, y: top, width: right - left, height: bottom - top } };
}

export async function annotateScreenshotAction(payload, data, owner) {
  if (!data || !payload) throw new TypeError('Screenshot image and metadata are required');
  const region = rectangle(payload.region, 'region');
  if (typeof payload.capturedAt !== 'string' || !Number.isFinite(Date.parse(payload.capturedAt))) {
    throw new TypeError('Screenshot capturedAt is required');
  }
  if (!['view-draw', 'draw-view-hierarchy'].includes(payload.captureMethod)) throw new TypeError('Invalid capture method');
  const image = annotateScreenshot(Buffer.from(data), payload.targetBounds, payload.sourceBounds,
    payload.captureMethod === 'view-draw' ? payload.density : payload.scale);
  const directory = resolve(owner.evidenceDirectory, 'screenshots');
  await mkdir(directory, { recursive: true });
  const filePath = resolve(directory, `${randomUUID()}.${image.format === 'jpeg' ? 'jpg' : 'png'}`);
  await writeFile(filePath, image.buffer);
  return { filePath, width: image.width, height: image.height, format: image.format,
    region, sourceBounds: payload.sourceBounds, highlight: image.highlight, unit: 'px',
    capturedAt: payload.capturedAt, captureMethod: payload.captureMethod };
}
