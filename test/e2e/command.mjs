import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function command(file, args, options = {}) {
  try {
    const { stdout } = await exec(file, args, { timeout: 600000, maxBuffer: 16 * 1024 * 1024, ...options });
    return stdout.trim();
  } catch (error) {
    throw new Error(`${file} ${args.join(' ')} failed:\n${error.stdout ?? ''}\n${error.stderr ?? error.message}`);
  }
}

