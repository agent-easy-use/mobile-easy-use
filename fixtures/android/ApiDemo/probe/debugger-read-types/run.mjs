import * as frida from 'frida';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const serial = process.argv[2];
if (!serial) throw Error('Usage: node run.mjs <adb-serial> [output-directory]');
const output = process.argv[3] ?? 'artifacts/benchmarks/debugger-read-types';
const pkg = 'com.agenteasyuse.mobileeasyuse.apidemo';
const fixture = pkg + '.state.DebuggerReadTypesFixture';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
await mkdir(output, { recursive: true });
const source = await readFile('fixtures/android/ApiDemo/app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/DebuggerReadTypesFixture.java', 'utf8');
const line = marker => {
  const found = source.split('\n').findIndex(s => s.includes(marker)) + 1;
  assert(found > 0, marker);
  return found;
};
const pid = Number(adb('shell', 'pidof', pkg));
assert(pid > 0, 'ApiDemo must be running');
const port = adb('forward', 'tcp:0', 'tcp:18484');
const evidence = { at: new Date().toISOString(), device: serial, pid, cases: [], passed: false };
let session, script;
evidence.failures = [];
function verify(label, actual, expected) {
  try { assert.deepEqual(actual, expected, label); }
  catch (error) { evidence.failures.push({label, message: error.message}); }
}
const arrays = {
  flags: ['true', 'false'], bytes: ['-128', '127'], chars: ['中', 'A'], shorts: ['-32768', '32767'],
  ints: ['-2147483648', '2147483647'], longs: ['-9223372036854775808', '9007199254740993', '9223372036854775807'],
  floats: ['1.25', '-0.0', 'NaN', 'Infinity'], doubles: ['-2.5', '-0.0', 'NaN', '-Infinity'],
  texts: ['你好', null, ''], matrix: [['1', '2'], [], ['-3']], empty: [],
};
const classes = { box: pkg + '.state.JvmtiDebuggerFixture$Box', boxed: 'java.lang.Integer',
  flags: '[Z', bytes: '[B', chars: '[C', shorts: '[S', ints: '[I', longs: '[J', floats: '[F',
  doubles: '[D', texts: '[Ljava.lang.String;', matrix: '[[I', empty: '[I' };
const marked = value => ({ type: 'number', value });
try {
  const device = await frida.getDeviceManager().addRemoteDevice(`127.0.0.1:${port}`);
  assert((await device.enumerateProcesses()).some(p => p.pid === pid), 'Gadget must belong to ApiDemo');
  session = await device.attach(pid);
  script = await session.createScript(await readFile(output + '/agent.js', 'utf8'));
  script.message.connect(message => {
    console.log('FRIDA', JSON.stringify(message));
    (evidence.messages ??= []).push(message);
  });
  await script.load();
  for (const instance of [false, true]) {
    await script.exports.configure(instance, line(instance ? 'BP_READ_INSTANCE' : 'BP_READ_STATIC'));
    await script.exports.trigger(instance);
    const deadline = Date.now() + 120000;
    let result;
    do {
      result = await script.exports.poll();
      if (result) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    assert.equal(result, 'ok:5');
    const hits = await script.exports.stop();
    evidence.cases.push({ method: instance ? 'readInstance' : 'readStatic', result, hits });
    assert.equal(hits.length, 5);
    for (const [i, hit] of hits.entries()) {
      assert.equal(hit.errors, undefined);
      assert.equal(Object.keys(hit.observations).length, 50);
      for (const kind of ['argument', 'local']) {
        const expected = {
          flag: i % 2 === 0, tiny: [-128, 127, -1, 0, 1][i],
          letter: ['\0', '\uffff', '中', 'A', 'B'][i],
          small: [-32768, 32767, -1, 0, 1][i], number: [-2147483648, 2147483647, -1, 0, 1][i],
          wide: { type: 'long', value: ['9007199254740993', '-9223372036854775808', '9223372036854775807', '-1', '0'][i] },
          single: [1.25, 0, marked('NaN'), marked('Infinity'), marked('-Infinity')][i],
          fraction: [-2.5, 0, marked('NaN'), marked('Infinity'), marked('-Infinity')][i],
          text: '读值🙂', nil: null, nullArray: null,
        };
        for (const [name, className] of Object.entries(classes)) expected[name] = { type: 'java-object', className };
        expected.texts = ['你好', null, ''];
        expected.matrix = Array(3).fill({type: 'java-object', className: '[I'});
        for (const [name, value] of Object.entries(expected)) {
          verify(`${instance}/${i}/${kind}/${name}`, hit.observations[kind + '.' + name], value);
        }
        const expectedInspect = {
          arrays, text: '读值🙂', boxVersion: 'jvmti-frida', boxCall: 'jvmti-frida', boxed: -42,
          nil: null, nullArray: null, negativeZeroFloat: i === 1, negativeZeroDouble: i === 1,
        };
        for (const [name, value] of Object.entries(expectedInspect)) {
          verify(`${instance}/${i}/${kind}/inspect/${name}`, hit.observations[kind + '.inspect'][name], value);
        }
      }
    }
    console.log('COLLECTED', instance ? 'instance' : 'static', '5 hits, 250 observations');
  }
  assert(!(evidence.messages ?? []).some(m => m.type === 'error'));
  assert.equal(evidence.failures.length, 0, 'Read matrix failures; see result.json');
  evidence.passed = true;
} catch (error) {
  evidence.error = error.stack;
  throw error;
} finally {
  try {
    if (script) { await script.exports.dispose(); await script.unload(); }
    if (session) await session.detach();
    assert.equal(Number(adb('shell', 'pidof', pkg)), pid);
    evidence.cleanup = { disposed: true, unloaded: true, detached: true, processAlive: true };
  } catch (error) {
    evidence.passed = false;
    evidence.cleanup = { error: String(error) };
    if (evidence.error === undefined) throw error;
  }
  finally {
    adb('forward', '--remove', `tcp:${port}`);
    await writeFile(output + '/result.json', JSON.stringify(evidence, null, 2) + '\n');
  }
}
