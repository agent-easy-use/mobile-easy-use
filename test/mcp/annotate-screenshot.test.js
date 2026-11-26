import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { annotateScreenshot } from '../../src/mcp-api/annotate-screenshot.js';

function original() {
  const image = new PNG({ width: 40, height: 30 });
  for (let i = 0; i < image.data.length; i += 4) image.data.set([10, 20, 30, 255], i);
  return PNG.sync.write(image);
}
test('highlight maps source coordinates, clips inward and preserves interior and outside', () => {
  const input = original();
  const result = annotateScreenshot(input, { x: 8, y: 24, width: 12, height: 10 },
    { x: 10, y: 20, width: 20, height: 15 });
  assert.deepEqual(result.highlight, { x: 0, y: 8, width: 20, height: 20 });
  const output = PNG.sync.read(result.buffer);
  const pixel = (x, y) => Array.from(output.data.subarray((y * 40 + x) * 4, (y * 40 + x) * 4 + 4));
  assert.deepEqual(pixel(0, 8), [255, 255, 255, 255]);
  assert.deepEqual(pixel(1, 9), [255, 60, 60, 255]);
  assert.deepEqual(pixel(7, 8), [10, 20, 30, 255]); // dash gap keeps original pixel
  assert.deepEqual(pixel(10, 18), [10, 20, 30, 255]);
  assert.deepEqual(pixel(30, 18), [10, 20, 30, 255]);
  assert.deepEqual(annotateScreenshot(input, null, { x: 0, y: 0, width: 40, height: 30 }).buffer, input);
});
test('highlight rejects empty intersection and invalid geometry', () => {
  const bounds = { x: 0, y: 0, width: 40, height: 30 };
  assert.throws(() => annotateScreenshot(original(), { x: 50, y: 0, width: 5, height: 5 }, bounds), /no area/);
  assert.throws(() => annotateScreenshot(original(), { ...bounds, x: NaN }, bounds), /finite/);
});

test('2dp/2pt stroke uses platform density/scale independently of window width', () => {
  for (const scale of [1, 2, 3]) {
    for (const width of [200, 720]) {
      const source = new PNG({ width, height: 100 });
      source.data.fill(0);
      const bounds = { x: 0, y: 0, width, height: 100 };
      const result = annotateScreenshot(PNG.sync.write(source), bounds, bounds, scale);
      const image = PNG.sync.read(result.buffer);
      const alpha = (x, y) => image.data[(y * image.width + x) * 4 + 3];
      assert.equal(alpha(3 * scale, 2 * scale - 1), 255);
      assert.equal(alpha(3 * scale, 2 * scale), 0);
      assert.equal(alpha(8 * scale, 0), 0);
      assert.equal(alpha(11 * scale, 0), 255);
    }
  }
});
