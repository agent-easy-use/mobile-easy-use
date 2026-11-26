import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Host paths belong to the consuming project's config, never the App's build machine.
export async function readDebuggerSymbols(configPath = resolve('.meu/config.json')) {
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Invalid config ${configPath}: ${error.message}`, { cause: error });
  }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(config)
      || (config.ios !== undefined && !object(config.ios))
      || (config.ios?.debugger !== undefined && !object(config.ios.debugger))) {
    throw new Error(`Invalid ios.debugger configuration in ${configPath}`);
  }
  const paths = config.ios?.debugger?.dsymPaths === undefined ? [] : config.ios.debugger.dsymPaths;
  if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || !path.trim())) {
    throw new Error(`ios.debugger.dsymPaths must be an array of non-empty paths in ${configPath}`);
  }
  return paths.map(path => ({ path, resolvedPath: resolve(dirname(configPath), path) }));
}
