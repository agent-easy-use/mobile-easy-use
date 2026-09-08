import { readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_VERSION } from '../package-info.js';

const require = createRequire(import.meta.url);

export async function getSdkDeclarations(input) {
  const platform = input?.platform;
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('platform must be android or ios');
  }

  const files = await Promise.all([
    declarationFile('sdk',
      `${platform === 'android' ? 'Android' : 'iOS'} SDK APIs for input, UI queries, waits, overrides, evidence collection, etc.`,
      () => fileURLToPath(new URL('../../package.json', import.meta.url)),
      `sdk/${platform}/index.d.ts`),
    declarationFile('bridge',
      platform === 'android'
        ? 'Frida Java bridge APIs for accessing Java classes and objects, calling methods, and installing hooks.'
        : 'Frida Objective-C bridge APIs for accessing classes and objects, calling selectors, and implementing methods.',
      () => require.resolve(
        `${platform === 'android' ? 'frida-java-bridge' : 'frida-objc-bridge'}/package.json`,
      )),
    declarationFile('gum',
      'Native Frida APIs including Interceptor, Memory, NativePointer, Process, and Module.',
      () => require.resolve('@types/frida-gum/package.json')),
  ]);
  return { platform, sdkVersion: MCP_VERSION, files };
}

async function declarationFile(source, description, resolvePackage, relativePath = 'index.d.ts') {
  try {
    const packagePath = resolvePackage();
    const { name: packageName, version: packageVersion } = JSON.parse(await readFile(packagePath, 'utf8'));
    const path = await realpath(resolve(dirname(packagePath), relativePath));
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) {
      throw new Error('expected a non-empty declaration file');
    }
    return { source, description, packageName, packageVersion, path };
  } catch (error) {
    throw new Error(
      `${source} declarations are unavailable; reinstall the npm package: ${error.message}`,
      { cause: error },
    );
  }
}
