import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRESETS_MODULE_PATH,
  SDK_BUNDLE_PATH,
  SDK_BUNDLE_PATHS,
  loadSdkSource,
} from '../src/sdk-source.js';

test('preset ES module uses the documented stable module path', () => {
  assert.equal(PRESETS_MODULE_PATH, '/docs/mobile-easy-use/presets.js');
});

test('loadSdkSource reads the build-time frida-compile SDK bundle', async () => {
  const first = await loadSdkSource();
  const second = await loadSdkSource();

  assert.equal(first, second);
  assert.equal(SDK_BUNDLE_PATH.endsWith('/sdk/dist/android.js'), true);
  assert.equal(SDK_BUNDLE_PATHS.ios.endsWith('/sdk/dist/ios.js'), true);
});
