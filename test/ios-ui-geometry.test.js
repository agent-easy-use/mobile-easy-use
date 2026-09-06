import assert from 'node:assert/strict';
import test from 'node:test';
import { rectValue } from '../sdk/ios/common/geometry.js';

test('iOS CGRect normalization accepts the real Frida ObjC bridge array shape', () => {
  assert.deepEqual(rectValue([[12, 34], [320, 48]]), {
    x: 12,
    y: 34,
    width: 320,
    height: 48,
  });
});

test('iOS CGRect normalization accepts named origin and size fields', () => {
  assert.deepEqual(rectValue({
    origin: { x: 1, y: 2 },
    size: { width: 3, height: 4 },
  }), { x: 1, y: 2, width: 3, height: 4 });
  assert.equal(rectValue(null), null);
  assert.equal(rectValue([[0], [10, 20]]), null);
});
