// Explicit macOS integration check, not part of the device-free Node suite.
// Runs the SDK control channel and LLDB worker (no native debugger bridge) against an owned Swift process.
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import frida from 'frida';
import { handleControllerMessage } from '../src/mcp-api/controller.js';

const execute = promisify(execFileCallback);
const directory = await mkdtemp(join(tmpdir(), 'meu-debugger-live-'));
const binary = join(directory, 'fixture');
const gate = join(directory, 'go');
const device = await frida.getLocalDevice();
let pid, attachment, script, host;
try {
  await execute('xcrun', ['swiftc', '-g', '-Onone', '-emit-object', '-whole-module-optimization',
    '-emit-module', '-emit-module-path', join(directory, 'DebuggerFixture.swiftmodule'),
    '-D', 'MEU_OBJC_FIXTURE', '-module-name', 'DebuggerFixture', 'test/fixtures/ios-debugger.swift', '-o', join(directory, 'fixture.o')]);
  await execute('xcrun', ['clang', '-g', '-fobjc-arc', '-c', 'test/fixtures/ios-debugger-objc.m', '-o', join(directory, 'objc.o')]);
  await execute('xcrun', ['swiftc', '-g', join(directory, 'fixture.o'),
    join(directory, 'objc.o'), '-Xlinker', '-export_dynamic',
    '-Xlinker', '-add_ast_path', '-Xlinker', join(directory, 'DebuggerFixture.swiftmodule'),
    '-o', binary]);
  await execute('xcrun', ['dsymutil', binary]);
  const bundle = await new frida.Compiler().build('test/fixtures/ios-debugger-agent.js', { projectRoot: process.cwd() });
  pid = await device.spawn([binary], { env: { MEU_DEBUGGER_GATE: gate, MEU_DEBUGGER_HOST_TEST: '1' } });
  attachment = await device.attach(pid);
  script = await attachment.createScript(bundle);
  const connection = { platform: 'ios', sdkScript: script,
    runnerPreparation: { physical: false, destinationId: 'macOS-fixture' } };
  script.message.connect((message, data) => {
    if (message.type === 'error') console.error(message);
    void handleControllerMessage(script, message, data, {}, connection);
  });
  await script.load();
  await device.resume(pid);
  console.log('live: Frida script loaded');
  await script.exports.attach();
  host = await connection.iosDebugger;
  console.log('live: LLDB initialized');
  const file = resolve('test/fixtures/ios-debugger.swift');
  const line = (await readFile(file, 'utf8')).split('\n').findIndex(line => line.includes('BREAKPOINT')) + 1;
  const objcFile = resolve('test/fixtures/ios-debugger-objc.m');
  const objcLine = (await readFile(objcFile, 'utf8')).split('\n').findIndex(line => line.includes('OBJC_BREAKPOINT')) + 1;
  await script.exports.register(file, line, objcFile, objcLine);
  console.log('live: breakpoint registered');
  await writeFile(gate, 'go');
  await new Promise(resolve => setTimeout(resolve, 4000));
  let stopTimer;
  const records = await Promise.race([
    script.exports.stop(),
    new Promise((_, reject) => { stopTimer = setTimeout(() => reject(new Error('SDK stop timed out')), 15000); }),
  ]).finally(() => clearTimeout(stopTimer));
  console.log('live: records', JSON.stringify(records));
  const objcRecords = await script.exports.stopobjc();
  console.log('live: ObjC records', JSON.stringify(objcRecords));
  const conditionRecords = await script.exports.stopcondition();
  console.log('live: condition records', JSON.stringify(conditionRecords));
  assert.equal(records.length, 1);
  const values = records[0].observations;
  assert.equal(values.before, 100);
  assert.equal(values.label, 'hi\0世界😀');
  assert.equal(values.erased, 'from Any');
  assert.equal(values.wide, '9223372036854775806');
  assert.equal(values.optional, 1);
  assert.equal(values.none, null);
  assert.equal(values.flag, true);
  assert.equal(values.decimal, 3.5);
  assert.equal(values.computed, 200);
  assert.equal(typeof values.object, 'string');
  assert.deepEqual(records[0].errors.map(e => e.name), ['failure']);
  assert.match(records[0].stack[0].function, /debuggerPrice/);
  assert.deepEqual(await script.exports.stop(), records);
  assert.equal(objcRecords.length, 2);
  for (const record of objcRecords) {
    assert.equal(record.observations.before, 10);
    assert.equal(record.observations.label, 'OC 世界');
    assert.equal(record.observations.erased, 'from id');
    assert.equal(record.observations.empty, null);
    assert.equal(record.observations.wide, '9223372036854775807');
    assert.deepEqual(record.errors.map(e => e.name), ['failure']);
  }
  assert.ok(conditionRecords.length >= 2);
  for (const record of conditionRecords) {
    assert.equal(record.errors[0].stage, 'condition');
    assert.equal(record.observations, undefined);
  }
  assert.equal(await script.exports.objcvalid(), 1);
  assert.deepEqual(await script.exports.swiftresults(), [211, 211]);
  console.log('live: SDK stop complete');
  await host.close();
  await script.exports.dispose();
  console.log('PASS: native conditions/expressions, JSON snapshots, overrides, buffered records and cleanup');
} catch (error) {
  console.error('live: failure', error, host?.diagnostics);
  throw error;
} finally {
  if (host && !host.transport.failure) { try { await host.close(); } catch {} }
  host?.child.kill();
  if (pid) await device.kill(pid).catch(() => {});
  if (script) await script.unload().catch(() => {});
  if (attachment) await attachment.detach().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
