import * as frida from 'frida';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const [serial, mode] = process.argv.slice(2);
if (!serial || !['legacy', 'apk'].includes(mode)) throw Error('Usage: node run.mjs <adb-serial> <legacy|apk>');
const root = 'artifacts/benchmarks/debugger-agent-loading';
const pkg = 'com.agenteasyuse.mobileeasyuse.apidemo';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const pid = Number(adb('shell', 'pidof', pkg));
assert(pid > 0);
const port = adb('forward', 'tcp:0', 'tcp:18484');
const evidence = { date: new Date().toISOString(), serial, mode, pid, passed: false, rounds: [], messages: [] };
let session, script;
try {
  const device = await frida.getDeviceManager().addRemoteDevice('127.0.0.1:' + port);
  assert((await device.enumerateProcesses()).some(p => p.pid === pid));
  session = await device.attach(pid);
  const source = await readFile('fixtures/android/ApiDemo/app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/JvmtiDebuggerFixture.java', 'utf8');
  const line = source.split('\n').findIndex(s => s.includes('// BP_COMPUTE')) + 1;
  for (let round = 0; round < 2; round++) {
    script = await session.createScript(await readFile(root + '/agent.bundle.js', 'utf8'));
    script.message.connect(m => { evidence.messages.push(m); console.log('FRIDA', JSON.stringify(m)); });
    await script.load();
    const before = await script.exports.info();
    assert.equal(before.resolvedPath.includes('!/'), mode === 'apk');
    before.pathContainsEquals = before.resolvedPath.includes('=');
    if (round === 0) assert.equal(before.modulePath, null, 'fresh process must not already have loaded the agent');
    await script.exports.configure(line);
    const after = await script.exports.info();
    assert(after.modulePath, 'agent module must be loaded');
    assert(after.modulePath.startsWith('/data/app/'), 'agent must load from the installation, not a temporary copy');
    adb('shell', 'am', 'start', '-W', '-n', pkg + '/.ui.JvmtiDebuggerActivity', '--activity-clear-top', '--es', 'mode', 'read', '--ei', 'count', '3');
    let result;
    const deadline = Date.now() + 20000;
    do {
      result = await script.exports.poll();
      if (result) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    assert(result && !result.startsWith('ERROR:'), result);
    const business = JSON.parse(result);
    assert.equal(business.values.length, 3);
    assert.equal(business.tail, 3); assert.equal(business.finally, 3);
    const hits = await script.exports.stop();
    assert.equal(hits.length, 3);
    hits.forEach((hit, i) => {
      assert.equal(hit.errors, undefined);
      assert.equal(hit.observations.input, i + 1);
      assert.equal(hit.observations.local, i + 11);
      assert.equal(hit.stack.length, 3);
    });
    evidence.rounds.push({ before, after, business, hits });
    await script.exports.dispose(); await script.unload(); script = null;
    assert.equal(Number(adb('shell', 'pidof', pkg)), pid);
  }
  assert(!evidence.messages.some(m => m.type === 'error'));
  evidence.passed = true;
  console.log('PASS', mode, '2 script lifecycles, 6 breakpoint hits');
} catch (e) { evidence.error = e.stack; throw e; }
finally {
  try { if (script) { await script.exports.dispose(); await script.unload(); } if (session) await session.detach(); }
  finally { adb('forward', '--remove', 'tcp:' + port); await writeFile(root + '/' + mode + '-result.json', JSON.stringify(evidence, null, 2)); }
}
