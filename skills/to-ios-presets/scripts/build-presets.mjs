import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLER = 'esbuild-wasm@0.25.12';
const PLATFORM = 'ios';

function execute(args, cwd) {
  return new Promise((accept, reject) => {
    const child = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostic = '';
    child.stdout.on('data', chunk => { diagnostic += chunk; });
    child.stderr.on('data', chunk => { diagnostic += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? accept() : reject(new Error(
      `Presets build failed (${code}). Node.js, npm and a reachable npm registry on first use are required.\n${diagnostic}`,
    )));
  });
}

async function buildModule(entry, output) {
  const root = dirname(entry);
  const workspace = await mkdtemp(resolve(tmpdir(), 'meu-presets-'));
  try {
    const bundlePath = resolve(workspace, 'bundle.js');
    const metadataPath = resolve(workspace, 'metadata.json');
    const args = [
      'exec', '--yes', `--package=${BUNDLER}`, '--', 'esbuild', resolve(entry),
      '--bundle', '--format=esm', '--platform=neutral', '--target=es2020',
      '--packages=external', '--charset=utf8', '--log-level=warning',
      '--log-override:unsupported-dynamic-import=error', '--log-override:unsupported-require-call=error',
      `--outfile=${bundlePath}`, `--metafile=${metadataPath}`,
    ];
    await execute(args, workspace);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const canonicalRoot = await realpath(root);
    for (const [path, input] of Object.entries(metadata.inputs)) {
      const local = relative(canonicalRoot, await realpath(resolve(workspace, path)));
      if (isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')
          || !['.js', '.mjs'].includes(extname(path)) || input.format === 'cjs') {
        throw new Error(`Only local JavaScript ES modules inside ${root} are supported: ${path}`);
      }
      if (input.imports.some(item => item.kind === 'require-call' || item.kind === 'require-resolve')) {
        throw new Error(`CommonJS imports are not supported: ${path}`);
      }
      if (input.imports.some(item => item.external)) {
        throw new Error(`External imports are not supported: ${path}`);
      }
    }
    const outputs = Object.values(metadata.outputs);
    if (outputs.length !== 1 || outputs[0].imports.length !== 0) {
      throw new Error('Expected one ESM bundle without external dependencies');
    }
    const source = (await readFile(bundlePath, 'utf8')).trim() || 'export {};';
    const temporary = `${output}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, source, { flag: 'wx' });
      await rename(temporary, output);
    } finally {
      await rm(temporary, { force: true });
    }
    return {
      ok: true, output, exports: outputs[0].exports,
      bytes: Buffer.byteLength(source),
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function runBuild() {
  const root = process.cwd();
  const configPath = resolve(root, '.meu/config.json');
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
  const base = config.presets?.directory;
  if (base !== undefined && (typeof base !== 'string' || !base.trim())) {
    throw new Error('presets.directory must be a non-empty base directory');
  }
  const directory = resolve(root, base ?? '.meu/presets', PLATFORM);
  const entry = resolve(directory, 'presets.entry.js');
  await access(entry);
  return { ...await buildModule(entry, resolve(directory, 'presets.dist.js')), directory, platform: PLATFORM };
}

if (process.argv[1] && (await realpath(process.argv[1]).catch(() => null)) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error('Run this script without arguments from the project root');
    console.log(JSON.stringify(await runBuild()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
