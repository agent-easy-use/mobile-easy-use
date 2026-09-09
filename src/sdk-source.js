import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const PRESETS_MODULE_PATH = '/meu/presets.js';

export const SDK_BUNDLE_PATHS = Object.freeze({
  android: fileURLToPath(new URL('../sdk/dist/android.js', import.meta.url)),
  ios: fileURLToPath(new URL('../sdk/dist/ios.js', import.meta.url)),
});
export const SDK_BUNDLE_PATH = SDK_BUNDLE_PATHS.android;

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

export async function loadPresetsSource(platform = 'android') {
  const projectRoot = process.cwd();
  if (!['android', 'ios'].includes(platform)) {
    throw new Error('Presets platform must be android or ios');
  }
  const configPath = resolve(projectRoot, '.meu/config.json');
  let config = {};
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Invalid config ${configPath}: ${error.message}`);
  }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(config) || (config.presets !== undefined && !object(config.presets))) {
    throw new Error(`Invalid presets configuration in ${configPath}`);
  }
  const directory = config.presets?.directory;
  if (directory !== undefined && (typeof directory !== 'string' || !directory.trim())) {
    throw new Error('presets.directory must be a non-empty base directory');
  }
  const output = resolve(projectRoot, directory ?? '.meu/presets', platform, 'presets.dist.js');
  try {
    const source = await readFile(output, 'utf8');
    if (!source.trim()) throw new Error('Bundle is empty');
    return source;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Failed to read presets ${output}: ${error.message}. Run the ${platform} presets skill build script.`, { cause: error });
  }
}
