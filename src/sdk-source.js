import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SDK_BUNDLE_PATHS = Object.freeze({
  android: fileURLToPath(new URL('../sdk/dist/android.js', import.meta.url)),
  ios: fileURLToPath(new URL('../sdk/dist/ios.js', import.meta.url)),
});
export const SDK_BUNDLE_PATH = SDK_BUNDLE_PATHS.android;
export const PRESETS_MODULE_PATH = '/docs/mobile-easy-use/presets.js';

export async function loadSdkSource(platform = 'android') {
  const bundlePath = SDK_BUNDLE_PATHS[platform];
  if (!bundlePath) {
    throw new Error(`Unsupported platform: ${platform}; expected android or ios`);
  }
  try {
    return await readFile(bundlePath, 'utf8');
  } catch (error) {
    throw new Error(
      `${platform} SDK bundle is unavailable; run \`npm run build:${platform}\`: ${error.message}`,
      { cause: error },
    );
  }
}

export function loadPresetsSource(projectRoot = process.cwd()) {
  const modulePath = resolve(projectRoot, 'docs/mobile-easy-use/presets.js');
  return readFile(modulePath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`Failed to read preset ES module: ${error.message}`, { cause: error });
  });
}
