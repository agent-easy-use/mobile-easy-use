import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';

export async function loadScript(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('filePath must be a non-empty string');
  }

  let canonicalPath;
  let source;
  try {
    canonicalPath = await realpath(filePath);
    source = await readFile(canonicalPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read script file ${filePath}: ${error.message}`);
  }
  if (source.length === 0) {
    throw new Error(`Script file ${filePath} is empty`);
  }
  if (/^\s*(?:module\s*\.\s*exports|(?:rpc\s*\.)?exports\s*\.)/m.test(source)) {
    throw new Error(
      'Probe scripts must be standard ES Modules. Export callable methods with '
      + '`export function name() {}` or `export async function name() {}`; '
      + '`exports.*`, `module.exports`, and `rpc.exports` are not supported.',
    );
  }

  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  return {
    source,
    modulePath: `${canonicalPath}?sha256=${sourceSha256}`,
  };
}
