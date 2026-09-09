import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmod, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../src/ios/load/load-mobile-easy-use.sh', import.meta.url));

async function runLoader(t, initiallyRunning, failStage = null) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'meu-cold-launch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const log = path.join(directory, 'calls.jsonl');
  const launched = path.join(directory, 'launched');
  const xcrun = path.join(directory, 'xcrun');
  await writeFile(xcrun, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MEU_TEST_CALLS, JSON.stringify({args,
  waitForMain: process.env.MOBILE_EASY_USE_LLDB_WAIT_FOR_MAIN}) + '\\n');
const jsonIndex = args.indexOf('--json-output');
const stage = args.includes('apps') ? 'apps'
  : args.includes('processes') ? (args.includes('--filter') ? 'verify-process' : 'process-snapshot')
  : args.includes('launch') ? (args.includes('--activate') ? 'activate' : 'launch')
  : null;
if (stage && stage === process.env.MEU_TEST_FAIL_STAGE) process.exit(17);
if (args.includes('launch')) fs.writeFileSync(process.env.MEU_TEST_LAUNCHED, 'true');
if (jsonIndex !== -1) {
  const proc = { processIdentifier: 1234, executable: 'file:///App/Test.app/Test' };
  let result = {};
  if (args.includes('details')) result = { identifier: 'CORE', hardwareProperties: { udid: 'UDID' } };
  if (args.includes('apps')) result = { apps: [{ bundleIdentifier: 'app.test', url: 'file:///App/Test.app/' }] };
  if (args.includes('launch')) result = { process: proc };
  if (args.includes('processes')) {
    const running = process.env.MEU_TEST_INITIALLY_RUNNING === 'true'
      || fs.existsSync(process.env.MEU_TEST_LAUNCHED);
    const extension = {
      processIdentifier: 5678,
      executable: 'file:///App/Test.app/PlugIns/Share.appex/Share',
    };
    result = { runningProcesses: running ? [proc, extension] : [extension] };
  }
  fs.writeFileSync(args[jsonIndex + 1], JSON.stringify({ result }));
}
if (args[0] === 'lldb') console.log(JSON.stringify({ok: true}));
`);
  await chmod(xcrun, 0o755);
  const execute = () => execFileSync('/bin/bash', [script, '--device', 'CORE', '--bundle-id', 'app.test'], {
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      MEU_TEST_CALLS: log,
      MEU_TEST_LAUNCHED: launched,
      MEU_TEST_INITIALLY_RUNNING: String(initiallyRunning),
      MEU_TEST_FAIL_STAGE: failStage ?? '',
    },
    timeout: 10000,
    encoding: 'utf8',
  });
  if (failStage) assert.throws(execute, error => error.status === 17);
  else execute();
  return (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
}

test('an absent device App is injected in the background and then activates the same PID', async t => {
  if (process.platform !== 'darwin') return t.skip('macOS shell loader');
  const calls = await runLoader(t, false);
  const launches = calls.filter(c => c.args.includes('launch'));
  assert.equal(launches.length, 2);
  assert.ok(launches[0].args.includes('--start-stopped'));
  assert.ok(launches[0].args.includes('--no-activate'));
  assert.ok(!launches[0].args.includes('--terminate-existing'));
  assert.ok(launches[1].args.includes('--activate'));
  assert.ok(!launches[1].args.includes('--start-stopped'));
  const attach = calls.find(c => c.args[0] === 'lldb');
  assert.equal(attach.waitForMain, 'true');
  assert.ok(attach.args.includes('device process attach -p 1234'));
});

test('a running device App is attached without another launch', async t => {
  if (process.platform !== 'darwin') return t.skip('macOS shell loader');
  const calls = await runLoader(t, true);
  assert.equal(calls.filter(c => c.args.includes('launch')).length, 0);
  const attach = calls.find(c => c.args[0] === 'lldb');
  assert.equal(attach.waitForMain, 'false');
  assert.ok(attach.args.includes('device process attach -p 1234'));
});

for (const stage of ['apps', 'process-snapshot', 'launch', 'verify-process', 'activate']) {
  test(`device Loader preserves CoreDevice failure status at ${stage}`, async t => {
    if (process.platform !== 'darwin') return t.skip('macOS shell loader');
    const calls = await runLoader(t, false, stage);
    const attaches = calls.filter(call => call.args[0] === 'lldb');
    assert.equal(attaches.length, stage === 'activate' ? 1 : 0);
    assert.equal(calls.filter(call => call.args.includes('--start-stopped')).length,
      ['launch', 'verify-process', 'activate'].includes(stage) ? 1 : 0);
  });
}
