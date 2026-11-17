import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { mkdir, readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as frida from 'frida';
import { GadgetConnection } from '../../src/mcp-api/api.js';
import { command } from './command.mjs';
import * as ui from './output.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const { values } = parseArgs({ options: {
  platform: { type: 'string' }, device: { type: 'string' }, suite: { type: 'string', default: 'drive/click' },
  'reuse-app': { type: 'boolean', default: false }, timeout: { type: 'string', default: '60000' },
  'report-limit': { type: 'string', default: '10' },
  help: { type: 'boolean' },
} });
if (values.help) {
  console.log('npm run test:e2e -- --platform android|ios [--device ID] [--suite drive/click|all] [--reuse-app] [--timeout 60000] [--report-limit 10]');
  process.exit(0);
}
if (!['android', 'ios'].includes(values.platform)) throw new Error('--platform android|ios is required');
const timeout = Number(values.timeout);
if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('--timeout must be positive milliseconds');
const platform = values.platform;
const runtime = await import(`./${platform}.mjs`);
const { appId } = runtime;
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const reportLimit = Number(values['report-limit']);
if (!Number.isInteger(reportLimit) || reportLimit < 0) throw new Error('--report-limit must be a non-negative integer');
const artifact = resolve(root, config[platform].artifact);
const testsRoot = resolve(root, 'fixtures', platform, 'ApiDemo/tests');
const output = resolve('artifacts/e2e', `${new Date().toISOString().replaceAll(':', '-')}-${platform}-${process.pid}`);
await mkdir(output, { recursive: true });
const report = { platform, appId, deviceId: null, sdk: 'built from working tree',
  app: values['reuse-app'] ? 'existing installation (not rebuilt)' : 'prebuilt artifact (not rebuilt)',
  artifact: values['reuse-app'] ? null : artifact,
  suites: [], errors: [], ok: false };
const runStarted = Date.now();
ui.header(platform, values.suite);
let connection, transport, workspace;
async function bounded(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function discover(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'helpers') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await discover(path));
    else if (entry.name.endsWith('.js')) result.push(path);
  }
  return result.sort();
}
try {
  // Only capability subdirectories belong to the new E2E suite; old flat scripts remain untouched.
  const files = (await Promise.all((await readdir(testsRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name !== 'helpers' && entry.name !== 'baselines')
    .map(entry => discover(resolve(testsRoot, entry.name))))).flat();
  const selected = files.filter(file => values.suite === 'all' || relative(testsRoot, file) === `${values.suite.replace(/\.js$/, '')}.js`);
  if (!selected.length) throw new Error(`No tests matched --suite ${values.suite}`);
  report.suites = selected.map(file => ({ file: relative(root, file), status: 'notRun' }));
  report.deviceId = await ui.step('Prepare simulator', () => runtime.selectDevice(values.device, output));
  report.system = await runtime.readSystem(report.deviceId);
  ui.detail(`${report.deviceId} · ${platform === 'ios' ? 'iOS' : 'Android'} ${report.system}`);
  await ui.step('Build SDK & presets', async () => {
    await command('npm', ['run', `build:${platform}`]);
    await command('node', [`skills/to-${platform}-presets/scripts/build-presets.mjs`]);
  });
  await ui.step(values['reuse-app'] ? 'Prepare installed ApiDemo' : 'Install prebuilt ApiDemo',
    () => runtime.prepareApp(report.deviceId, values['reuse-app'], artifact));
  report.revision = await command('git', ['rev-parse', 'HEAD']);
  report.workingTree = await command('git', ['status', '--short']);
  await ui.step('Bundle test scripts', async () => {
    workspace = await mkdtemp(resolve(tmpdir(), 'meu-e2e-'));
    // Reuse the actual bridge instances installed by the production SDK, not duplicate runtimes or mocks.
    for (const [name, global] of [['java', 'Java'], ['objc', 'ObjC']]) {
      await writeFile(resolve(workspace, `${name}.js`), `export default globalThis.${global};\n`);
    }
    for (let i = 0; i < selected.length; i++) {
      const bundle = resolve(workspace, `${i}.js`);
      await command('npm', ['exec', '--yes', '--package=esbuild-wasm@0.25.12', '--', 'esbuild', selected[i],
        '--bundle', '--format=esm', '--platform=neutral', '--target=es2020', '--external:/meu/presets.js',
        `--alias:frida-java-bridge=${workspace}/java.js`, `--alias:frida-objc-bridge=${workspace}/objc.js`,
        `--outfile=${bundle}`, '--log-level=warning']);
    }
  });
  transport = await runtime.prepareConnection(report.deviceId);
  connection = new GadgetConnection(frida.getDeviceManager(), { evidenceDirectory: output });
  await ui.step('Connect to App', () => bounded(connection.connect({ platform, deviceId: report.deviceId, appId, runtimePort: 8484,
    ip: '127.0.0.1', port: transport.port }), 240000, 'Connect'));
  console.log();
  for (let i = 0; i < selected.length; i++) {
    const suite = report.suites[i];
    ui.start(`Run ${relative(testsRoot, selected[i]).replace(/\.js$/, '')}`);
    const started = Date.now();
    try {
      const response = await bounded(connection.callFunction({ filePath: resolve(workspace, `${i}.js`),
        functionName: 'run' }), timeout, suite.file);
      suite.report = response.result;
      suite.evidence = response.evidence;
      if (!suite.report || !Array.isArray(suite.report.tests) || suite.report.total < 1) throw new Error('Invalid or empty Test report');
      suite.status = suite.report.ok === true && suite.report.failed === 0 && suite.report.notRun === 0
        && suite.report.passed === suite.report.total && suite.report.tests.every(test => test.status === 'passed') ? 'passed' : 'failed';
    } catch (error) {
      suite.status = 'failed';
      suite.error = error.stack ?? String(error);
    }
    suite.durationMs = Date.now() - started;
    ui.finish(suite.status === 'passed');
    if (suite.error) ui.error(suite.error);
    if (suite.status !== 'passed') break; // Do not continue in a potentially dirty App.
  }
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  ui.start('Clean up session');
  const errorsBeforeCleanup = report.errors.length;
  if (connection) {
    try { await bounded(connection.disconnect(), 15000, 'Disconnect'); }
    catch (error) { report.errors.push(`Cleanup: ${error.message}`); }
  }
  if (transport?.cleanup) {
    try { await transport.cleanup(); }
    catch (error) { report.errors.push(`Transport cleanup: ${error.message}`); }
  }
  if (workspace) await rm(workspace, { recursive: true, force: true });
  ui.finish(report.errors.length === errorsBeforeCleanup);
  report.ok = report.errors.length === 0 && report.suites.length > 0 && report.suites.every(suite => suite.status === 'passed');
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const error of report.errors) ui.error(error);
  ui.summary(report, `${relative(root, output)}/report.json`, Date.now() - runStarted, reportLimit);
}
// Bound the CLI lifetime even when a timed-out Frida RPC is still pending.
process.exit(report.ok ? 0 : 1);
