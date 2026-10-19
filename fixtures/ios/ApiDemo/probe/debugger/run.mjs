import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as frida from 'frida';
import { loadIOSRuntime } from '../../../../../src/ios/load/runtime-loader.js';
import { prepareIOSRunner } from '../../../../../src/mcp-api/ios-runner.js';
import { loadSdkSource } from '../../../../../src/sdk-source.js';
import { handleControllerMessage } from '../../../../../src/mcp-api/controller.js';
import { cases } from './cases.js';

const [kind, deviceId, endpoint = '127.0.0.1:8484', filter] = process.argv.slice(2);
if (!['simulator', 'device'].includes(kind) || !deviceId) {
  throw Error('Usage: node run.mjs simulator|device <device-id> [host:port] [case-name-filter]');
}
const appId = 'com.agenteasyuse.mobileeasyuse.apidemo.ios';
const execute = promisify(execFileCallback);
// Reuse device ID resolution; this suite does not run XCTest or require its signing.
const preparation = await prepareIOSRunner({ deviceId, appId }, { readSigning: async () => null });
assert.equal(preparation.physical, kind === 'device', 'Device kind does not match the selected target');
const root = new URL('../../ApiDemo/State/', import.meta.url);
const files = { oc: new URL('APIDebuggerFixture.m', root), swift: new URL('APIDebuggerSwiftFixture.swift', root) };
const texts = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));
function source(language, marker) {
  const tag = `// BP_${language.toUpperCase()}_${marker}`;
  const lines = texts[language].split('\n').flatMap((line, i) => line.trim().endsWith(tag) ? [i + 1] : []);
  assert.equal(lines.length, 1, tag);
  return { kind: 'source', file: fileURLToPath(files[language]), line: lines[0] };
}
const selected = cases(source).filter(item => !filter || item.name.includes(filter));
assert(selected.length, 'No matching cases');
const output = new URL('../../../../../artifacts/benchmarks/ios-debugger/', import.meta.url);
await mkdir(output, { recursive: true });
const reportFile = new URL(filter ? 'filtered-result.json' : 'result.json', output);
const report = { at: new Date().toISOString(), kind, deviceId, appId, endpoint,
  xcode: (await execute('xcodebuild', ['-version'])).stdout.trim(),
  lldb: (await execute('xcrun', ['lldb', '--version'])).stdout.trim(), cases: [], messages: [] };
let device, session, script, connection;
const agent = await readFile(new URL('agent.js', import.meta.url), 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, label, ms = 30000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timed out`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function call(name, ...args) {
  return bounded(script.exports.callFunction('/fixture/debugger.js', agent, name, args), name, name === 'attach' || name === 'concurrentAttach' ? 130000 : 30000);
}
async function open() {
  report.loader = await loadIOSRuntime({ deviceId, appId });
  device = await frida.getDeviceManager().addRemoteDevice(endpoint);
  session = await device.attach('Gadget');
  script = await session.createScript(await loadSdkSource('ios'));
  connection = { platform: 'ios', sdkScript: script, runnerPreparation: preparation };
  script.message.connect((message, data) => {
    if (message.type === 'error') report.messages.push(message);
    void handleControllerMessage(script, message, data, {}, connection).catch(error => report.messages.push({ error: String(error) }));
  });
  await script.load();
  report.runtime = await script.exports.runtimeStatus();
  report.platform = await script.exports.evalScript('/fixture/platform.js', '(async () => ({ os: ObjC.classes.UIDevice.currentDevice().systemVersion().toString(), arch: Process.arch }))()');
  assert.equal(report.runtime.appId, appId);
}
async function close() {
  if (connection?.iosDebugger) {
    const host = await connection.iosDebugger.catch(() => null);
    if (host) {
      try { await bounded(host.close(), 'Host detach', 5000); } catch (error) { report.messages.push({ cleanup: String(error) }); }
      host.child.kill();
    }
  }
  if (script) await bounded(script.unload(), 'unload', 5000).catch(() => {});
  if (session) await bounded(session.detach(), 'Frida detach', 5000).catch(() => {});
  script = session = connection = null;
}
async function complete(operation, count = 1) {
  await call('trigger', operation, count);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const actual = await call('poll');
    if (actual.done) { assert.equal(actual.failure, null); return actual; }
    await delay(50);
  }
  throw Error('Native fixture did not complete');
}
async function lifecycle() {
  const definition = { breakpoint: source('oc', 'VALUE'), observations: { value: 'price' }, overrides: { 'self.field': '30' } };
  await assert.rejects(call('register', definition), /attach/);
  const attached = await call('concurrentAttach');
  assert.deepEqual(attached.map(item => item.status).sort(), ['fulfilled', 'rejected']);
  await assert.rejects(call('attach'), /Detach/);
  await call('register', definition);
  assert.deepEqual((await complete('oc')).values, [40]);
  const [first, second] = await call('concurrentStop');
  assert.equal(first.length, 1); assert.deepEqual(second, first);
  assert.deepEqual((await complete('oc')).values, [15]);
  assert.deepEqual(await call('collect'), first);
  await call('register', definition);
  await call('detach');
  await assert.rejects(call('collect'), /ended/);
  await call('detach');
  await call('attach');
  await call('register', definition);
  await complete('oc');
  assert.equal((await call('collect')).length, 1);
}
try {
  for (const item of selected) {
    const record = { name: item.name, status: 'not-run', phase: 'runtime' };
    report.cases.push(record);
    console.log(`RUN ${item.name}`);
    try {
      if (!script) await open();
      if (item.lifecycle) {
        record.phase = 'lifecycle';
        await lifecycle();
      } else {
        record.phase = 'attach';
        record.attach = await call('attach');
        record.phase = 'register';
        const definition = item.address ? { ...item.definition, breakpoint: { kind: 'address', address: await call('address') } } : item.definition;
        record.definition = definition;
        await call('register', definition);
        record.phase = 'execute';
        record.actual = await complete(item.operation, item.count);
        record.phase = 'collect';
        record.hits = await call('collect');
        record.phase = 'verify';
        item.verify(record);
      }
      record.phase = 'detach';
      await call('detach');
      record.phase = 'complete';
      record.status = 'passed';
    } catch (error) {
      record.status = ['runtime', 'attach'].includes(record.phase) ? 'not-run' : 'failed';
      record.error = error.stack ?? String(error);
      console.error(`${record.status.toUpperCase()} ${item.name}: ${error.message}`);
      await close();
      // A failed case may have crashed or stranded the App. Reset before the next case.
      if (kind === 'simulator') await execute('xcrun', ['simctl', 'terminate', deviceId, appId]).catch(() => {});
    }
    console.log(`${record.status.toUpperCase()} ${item.name}`);
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  }
} finally { await close(); }
report.summary = Object.fromEntries(['passed', 'failed', 'not-run'].map(status => [status, report.cases.filter(item => item.status === status).length]));
await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
if (report.summary.failed || report.summary['not-run']) process.exitCode = 1;
