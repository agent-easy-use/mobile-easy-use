import { execFile as execFileCallback } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const IOS_LOAD_SCRIPT = fileURLToPath(new URL('./load-mobile-easy-use.sh', import.meta.url));
const OUTPUT_LIMIT_BYTES = 1024 * 1024;

export async function loadIOSRuntime({ deviceId, appId }, {
  execute = execFile,
  loadScript = IOS_LOAD_SCRIPT,
} = {}) {
  const targetFlag = await isBootedSimulator(execute, deviceId)
    ? '--simulator'
    : '--device';
  let stdout;
  try {
    ({ stdout } = await execute(
      loadScript,
      [targetFlag, deviceId, '--bundle-id', appId],
      { encoding: 'utf8', maxBuffer: OUTPUT_LIMIT_BYTES },
    ));
  } catch (error) {
    const diagnostics = [error?.stderr, error?.stdout]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join('\n');
    const detail = diagnostics || error.message;
    throw new Error(`iOS Runtime Loader failed: ${detail}`, { cause: error });
  }

  const result = parseLoaderResult(stdout);
  validateLoaderResult(result);
  return result;
}

async function isBootedSimulator(execute, deviceId) {
  try {
    await execute(
      'xcrun',
      ['simctl', 'getenv', deviceId, 'SIMULATOR_UDID'],
      { encoding: 'utf8', maxBuffer: OUTPUT_LIMIT_BYTES },
    );
    return true;
  } catch {
    return false;
  }
}

function parseLoaderResult(stdout) {
  const lines = String(stdout ?? '').trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Continue to the next candidate so diagnostic output cannot mask the result.
    }
  }
  throw new Error('iOS Runtime Loader returned no JSON result');
}

function validateLoaderResult(result) {
  if (result?.ok !== true
      || !['loaded', 'already-loaded'].includes(result.loadState)
      || result.detachState !== 'detached') {
    throw new Error(`iOS Runtime Loader returned an invalid result: ${JSON.stringify(result)}`);
  }
  for (const imageName of ['MobileEasyUse.dylib', 'MobileEasyUseRuntime.dylib']) {
    if (!Array.isArray(result.images?.[imageName]) || result.images[imageName].length !== 1) {
      throw new Error(
        `iOS Runtime Loader expected exactly one ${imageName}: ${JSON.stringify(result.images)}`,
      );
    }
  }
}
