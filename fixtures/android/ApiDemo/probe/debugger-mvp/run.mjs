import * as frida from 'frida';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { types, describe } from './cases.js';

const serial = process.argv[2];
if (!serial) throw Error('Usage: node run.mjs <adb-serial>');
const output = 'artifacts/benchmarks/debugger-mvp';
const pkg = 'com.agenteasyuse.mobileeasyuse.apidemo';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const source = await readFile('fixtures/android/ApiDemo/app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/DebuggerMvpFixture.java', 'utf8');
const line = marker => {
  const matches = source.split('\n').flatMap((text, i) => text.trim().endsWith('// ' + marker) ? [i + 1] : []);
  assert.equal(matches.length, 1, marker); return matches[0];
};
await mkdir(output, {recursive: true});
const pid = Number(adb('shell', 'pidof', pkg));
assert(pid > 0);
const port = adb('forward', 'tcp:0', 'tcp:18484');
const evidence = { at: new Date().toISOString(), serial, pid, passed: false, cases: [], messages: [] };
let session, script;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(read, accept) {
  const deadline = Date.now() + 20000;
  do { const value = await read(); if (accept(value)) return value; await delay(50); } while (Date.now() < deadline);
  throw Error('Fixture timed out');
}
async function complete() {
  const {result} = await waitFor(() => script.exports.poll(), state => !!state.result);
  assert(!result.startsWith('ERROR:'), result); return JSON.parse(result);
}
async function collect(config, business = 'sequence', count = 1) {
  await script.exports.configure({line: line('BP_SEQUENCE'), ...config});
  await script.exports.trigger(business, count);
  const actual = await complete(), hits = await script.exports.stop();
  evidence.cases.push({config, business, actual, hits});
  return {actual, hits};
}
function clean(hits) { for (const hit of hits) assert.equal(hit.errors, undefined, JSON.stringify(hit)); }
function errors(hit, stage) { return (hit.errors ?? []).filter(error => error.stage === stage); }
try {
  const device = await frida.getDeviceManager().addRemoteDevice('127.0.0.1:' + port);
  assert((await device.enumerateProcesses()).some(p => p.pid === pid));
  session = await device.attach(pid);
  script = await session.createScript(await readFile(output + '/agent.js', 'utf8'));
  script.message.connect(message => evidence.messages.push(message));
  await script.load();

  // Real Java return/local consumption verifies all supported JNI write/return categories.
  for (const type of types) {
    for (const operation of ['local', 'argument', 'return']) {
      const count = type.values.length;
      const {actual, hits} = await collect({type: type.name, operation, line: line('BP_TYPE_' + type.name)}, 'type' + type.name, count);
      assert.equal(hits.length, count); clean(hits);
      const initial = Array(count).fill(describe(type, type.initial));
      const changed = type.values.map(value => describe(type, value));
      assert.deepEqual(actual.values, operation === 'local' ? initial : changed);
      assert.deepEqual(actual.locals, operation === 'return' ? Array(count).fill('null') : operation === 'local' ? changed : initial);
      assert.equal(actual.tail, operation === 'return' ? 0 : count);
      assert.equal(actual.finally, operation === 'return' ? 0 : count);
      assert(hits.every(hit => !('overrides' in hit) && !('earlyReturn' in hit)));
      await script.exports.releaseValues();
    }
  }
  const voidCase = await collect({type: 'Void', operation: 'return', line: line('BP_TYPE_Void')}, 'typeVoid');
  clean(voidCase.hits); assert.deepEqual(voidCase.actual, {values: ['void'], locals: ['null'], tail: 0, finally: 0});

  // Verify every field JNI read/write branch against the Java-side result.
  const arrayClasses = { Booleans: '[Z', Bytes: '[B', Chars: '[C', Shorts: '[S', Ints: '[I',
    Longs: '[J', Floats: '[F', Doubles: '[D', Strings: '[Ljava.lang.String;', Matrix: '[[I' };
  for (const type of types) {
    const direct = await script.exports.directField(type.name, type.values);
    const {actual, hits} = await collect({type: type.name, operation: 'field', line: line('BP_FIELD_TYPES')},
      'field' + type.name, type.values.length);
    evidence.cases.at(-1).frida = direct;
    clean(hits); assert.equal(hits.length, type.values.length);
    const before = type.name === 'Strings' ? ['old'] : type.name === 'Matrix' ? [{type: 'java-object', className: '[I'}] : type.component ? {type: 'java-object', className: arrayClasses[type.name]}
      : type.name === 'Object' ? {type: 'java-object', className: type.java}
      : type.name === 'Long' ? {type: 'long', value: type.initial} : type.initial;
    assert(hits.every(hit => !('stack' in hit)));
    for (const hit of hits) assert.deepEqual(hit.observations, {before});
    assert.deepEqual(actual.values, type.values.map(value => describe(type, value)));
    assert.deepEqual(direct, actual.values.map(value => ({value})));
    assert.equal(actual.tail, type.values.length);
    await script.exports.releaseValues();
  }

  const conversion = await collect({mode: 'conversions', line: line('BP_CONVERSIONS')}, 'conversions');
  clean(conversion.hits);
  const comparison = conversion.hits[0].observations.compare;
  assert.deepEqual(comparison.debug, comparison.frida);
  assert.equal(comparison.debug.parent.hidden, 40);
  assert.equal(comparison.debug.concrete.hidden, 50);
  assert.equal(comparison.debug.object.hidden, null);
  assert.equal(comparison.debug.parent.text, 'undefined');
  assert.equal(comparison.debug.concrete.text, 'object');
  assert.equal(comparison.castText, 'old');
  assert.deepEqual(JSON.parse(conversion.actual.values[0]), {
    ints: '["9","2"]', names: '["old","null"]', hidden: 40, amount: 200, same: true,
  });
  const cleanup = await script.exports.cleanupEvidence();
  evidence.cases.at(-1).references = cleanup;
  assert.deepEqual(cleanup, {
    disposed: [true, true, true, true, true], retained: 40, cloned: [9, 2], external: 40,
  });
  await script.exports.releaseValues();

  // Compare native consumption/rejection with ordinary Frida field assignment.
  for (const [type, values] of [
    ['Int', [1.5, 2147483648]], ['Boolean', [1]], ['Ints', [[1, 'bad']]],
    ['Strings', [[1]]], ['Matrix', [[[1], ['bad']]]],
    ['Long', [42, 1.5, 9007199254740992]],
  ]) {
    const direct = await script.exports.directField(type, values);
    const {actual, hits} = await collect({type, operation: 'field', values, line: line('BP_FIELD_TYPES')}, 'field' + type, values.length);
    evidence.cases.at(-1).frida = direct;
    for (let i = 0; i < values.length; i++) {
      assert.equal(errors(hits[i], 'overrides').length > 0, !!direct[i].rejected, type);
      if (!direct[i].rejected) assert.equal(actual.values[i], direct[i].value, type);
    }
    await script.exports.releaseValues();
  }

  const stageCase = await collect({mode: 'stages'});
  clean(stageCase.hits);
  assert.deepEqual(stageCase.hits[0].observations, {before: 1, computed: 12});
  assert.deepEqual(stageCase.actual, {values: ['51'], locals: ['null'], tail: 0, finally: 0});
  assert.deepEqual(stageCase.hits[0].stack.map(frame => frame.methodName), ['sequence', 'caller2', 'caller1']);
  assert.equal(stageCase.hits[0].stack[0].line, line('BP_SEQUENCE'));

  for (const [mode, expected] of [['read', '12'], ['override-only', '51'], ['return-only', '777'], ['stack-only', '12'], ['empty', '12']]) {
    const {actual, hits} = await collect({mode}); clean(hits); assert.equal(hits.length, 1);
    assert.deepEqual(actual.values, [expected]);
    assert.equal('observations' in hits[0], mode === 'read');
    assert.equal('stack' in hits[0], mode === 'stack-only');
    if (mode === 'stack-only') assert.equal(hits[0].stack.length, 2);
  }
  const filtered = await collect({mode: 'condition'}, 'sequence', 4);
  assert.deepEqual(filtered.hits.map(hit => hit.observations.value), [3, 4]); clean(filtered.hits);
  const overload = await collect({mode: 'overloaded', argumentTypes: ['int'], line: line('BP_OVERLOAD_INT')}, 'overloaded', 3);
  clean(overload.hits);
  assert.deepEqual(overload.hits.map(hit => hit.observations.value), [1, 2, 3]);
  assert.deepEqual(overload.actual.values, ['40', '40', '40']);
  const classTarget = await collect({mode: 'read', classTarget: true, argumentTypes: ['int']});
  clean(classTarget.hits); assert.deepEqual(classTarget.hits[0].observations, {value: 1, local: 11});
  for (const argumentTypes of [undefined, ['long']]) {
    await assert.rejects(script.exports.configure({mode: 'overloaded', argumentTypes, line: line('BP_OVERLOAD_INT')}));
    evidence.cases.push({mode: 'overloaded', argumentTypes, rejected: true});
  }
  const excluded = await collect({mode: 'condition-false'});
  assert.deepEqual(excluded.hits, []); assert.deepEqual(excluded.actual.values, ['12']);
  for (const mode of ['condition-error', 'condition-type']) {
    const {actual, hits} = await collect({mode});
    assert.equal(errors(hits[0], 'condition').length, 1); assert(!('observations' in hits[0]));
    assert.deepEqual(actual.values, ['12']);
  }
  const observed = await collect({mode: 'observation-errors'});
  assert.deepEqual(observed.hits[0].observations, {good: 1, nil: null});
  assert.equal(errors(observed.hits[0], 'observations').length, 6);
  assert.deepEqual(observed.actual.values, ['40']);
  const overwritten = await collect({mode: 'override-errors'});
  assert.equal(errors(overwritten.hits[0], 'overrides').length, 2);
  assert.deepEqual(overwritten.actual.values, ['777']); // override errors do not suppress earlyReturn.
  assert.equal(overwritten.actual.tail, 0);
  const isolated = await collect({mode: 'isolated-errors'});
  assert.deepEqual(isolated.hits[0].observations, {good: 1});
  assert.deepEqual(isolated.hits[0].errors.map(({stage, name}) => ({stage, name})), [
    {stage: 'observations', name: 'failure'}, {stage: 'overrides', name: 'this'},
    {stage: 'overrides', name: 'absent'},
  ]);
  assert.deepEqual(isolated.actual.values, ['42']);
  assert.equal(isolated.actual.tail, 0);
  const returned = await collect({mode: 'return-error'});
  assert.equal(errors(returned.hits[0], 'earlyReturn').length, 1); assert.deepEqual(returned.actual.values, ['51']);
  const iterator = await collect({mode: 'java-iterator'}); clean(iterator.hits);
  assert.equal(iterator.hits[0].observations.iterator.type, 'java-object');
  const shared = await collect({mode: 'shared-get'});
  assert.deepEqual(shared.hits[0].observations, {save: 1, again: 1, good: 1});
  clean(shared.hits);
  assert.match(await script.exports.expiredGet(), /breakpoint hit/);

  for (const mode of ['names', 'fields', 'bad-fields', 'this-write']) {
    const {actual, hits} = await collect({mode, line: line('BP_NAMES')}, 'names');
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].observations, {count: 3, local: 2, field: 100, amount: 200, inherited: 30,
      owner: {type: 'java-object', className: pkg + '.state.DebuggerMvpFixture$Counter'}});
    const state = JSON.parse(actual.locals[0]);
    if (mode === 'names') { clean(hits); assert.equal(state.argument, 5); assert.equal(state.local, 7); assert.equal(state.field, 100); }
    if (mode === 'fields') { clean(hits); assert.equal(state.amount, 20); assert.equal(state.inherited, 4); assert.equal(state.text, '中文🙂'); assert.equal(state.flag, true); assert.equal(state.items, 'null'); }
    if (mode === 'bad-fields') { assert.equal(errors(hits[0], 'overrides').length, 2); assert.equal(state.amount, 200); assert.equal(state.items, '["7"]'); }
    if (mode === 'this-write') { assert.match(errors(hits[0], 'overrides')[0].message, /Cannot replace this/); assert.equal(state.field, 100); }
  }
  const strippedSource = await readFile('fixtures/android/ApiDemo/app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/DebuggerNoLocalsFixture.java', 'utf8');
  const noLocals = await collect({mode: 'no-locals', line: strippedSource.split('\n').findIndex(s => s.includes('// BP_NO_LOCALS')) + 1}, 'noLocals');
  assert.equal(noLocals.hits[0].observations.field, 100);
  assert.equal(noLocals.hits[0].observations.owner.className, pkg + '.state.DebuggerNoLocalsFixture');
  assert.equal('count' in noLocals.hits[0].observations, false);
  assert.deepEqual(noLocals.hits[0].errors.map(error => error.stage), ['observations', 'overrides']);
  assert(noLocals.hits[0].errors.every(error => /Debug information is absent/.test(error.message)));
  assert.deepEqual(noLocals.actual.values, ['103']);
  const parent = await collect({mode: 'shadow', line: line('BP_PARENT')}, 'parent');
  clean(parent.hits); assert.equal(parent.hits[0].observations.hidden, 40);
  for (const [mode, marker, expected] of [['scope-in', 'BP_FIELD_SCOPE_IN', 2], ['scope-out', 'BP_FIELD_SCOPE_OUT', 100]]) {
    const result = await collect({mode, line: line(marker)}, 'fieldScope');
    clean(result.hits); assert.equal(result.hits[0].observations.count, expected);
  }
  // Declaration types govern unboxing and assignment, exactly as in ordinary Frida calls.
  for (const textType of ['String', 'Object', 'CharSequence']) {
    for (const mode of ['text-read', 'text-write', 'text-return', 'text-boxed-write', 'text-boxed-return']) {
      const {actual, hits} = await collect({mode, textType, line: line('BP_TEXT_' + textType)}, 'text' + textType, 3);
      const rejected = textType === 'CharSequence' && ['text-write', 'text-return'].includes(mode);
      if (!rejected) clean(hits);
      else for (const hit of hits) {
        const stage = mode === 'text-write' ? 'overrides' : 'earlyReturn';
        assert.equal(errors(hit, stage).length, mode === 'text-write' ? 2 : 1);
        assert.equal(hit.errors.length, mode === 'text-write' ? 2 : 1);
      }
      assert.deepEqual(hits.map(hit => hit.observations.text), ['', '中文', 'emoji🙂']);
      assert.deepEqual(hits.map(hit => hit.observations.value), textType === 'String' ? ['', '中文', 'emoji🙂']
        : Array(3).fill({type: 'java-object', className: 'java.lang.String'}));
      assert(hits.every(hit => hit.observations.kind === (textType === 'String' ? 'string' : 'object')));
      assert.deepEqual(actual.values, rejected || mode === 'text-read' ? ['', '中文', 'emoji🙂']
        : Array(3).fill(mode.endsWith('write') ? '中文🙂' : '返回🙂'));
      await script.exports.releaseValues();
    }
  }
  for (const textType of ['String', 'Object', 'CharSequence']) {
    const result = await collect({mode: 'text-null', textType, line: line('BP_TEXT_' + textType)}, 'null' + textType);
    clean(result.hits); assert.deepEqual(result.hits[0].observations, {value: null, local: null, text: null, kind: 'null'});
    assert.deepEqual(result.actual.values, ['null']);
  }
  const builder = await collect({mode: 'text-read', textType: 'CharSequence', line: line('BP_TEXT_CharSequence')}, 'textBuilder');
  clean(builder.hits); assert.equal(builder.hits[0].observations.kind, 'object');
  assert.deepEqual(builder.hits[0].observations.value, {type: 'java-object', className: 'java.lang.StringBuilder'});
  const concurrent = await collect({mode: 'concurrent'}, 'concurrent', 10);
  clean(concurrent.hits); assert.equal(concurrent.hits.length, 40); assert.equal(new Set(concurrent.hits.map(hit => hit.thread.id)).size, 4);
  assert.deepEqual(concurrent.hits.map(hit => hit.observations.value).sort((a,b) => a-b), Array.from({length: 40}, (_,i) => i+1));
  const nested = await collect({mode: 'reentrant'}); clean(nested.hits);
  assert.equal(nested.hits.length, 1); assert.equal(nested.hits[0].observations.nested, 28);
  for (const mode of ['async', 'generator', 'async-generator', 'async-condition', 'bad-observation', 'bad-line']) {
    await assert.rejects(script.exports.configure({mode, line: line('BP_SEQUENCE')}));
    evidence.cases.push({mode, rejected: true});
  }
  for (const depth of [0, -1, 1.5, 2147483648]) {
    await assert.rejects(script.exports.configure({mode: 'bad-stack', depth, line: line('BP_SEQUENCE')}), /stack/);
    evidence.cases.push({depth, rejected: true});
  }
  await script.exports.configure({mode: 'inflight', line: line('BP_SEQUENCE')});
  await script.exports.trigger('sequence', 2);
  await waitFor(() => script.exports.poll(), state => state.entered);
  await script.exports.beginStop(); await delay(100); assert.equal(await script.exports.stopState(), false);
  await script.exports.release();
  const hits = await script.exports.finishStop(); clean(hits); assert.equal(hits.length, 1);
  assert.equal(hits[0].observations.gate, 'released'); await complete();
  assert.deepEqual(await script.exports.stop(), hits);
  await script.exports.reset(); await script.exports.trigger('sequence', 1); await complete();
  assert.deepEqual(await script.exports.stop(), hits);
  evidence.cases.push({mode: 'inflight-stop', hits});
  const reopened = await collect({mode: 'read'}); clean(reopened.hits); assert.equal(reopened.hits.length, 1);
  assert(!evidence.messages.some(message => message.type === 'error'));
  evidence.passed = true;
  console.log('PASS', evidence.cases.length, 'new API cases');
} catch (error) { evidence.error = error.stack; throw error; }
finally {
  try {
    if (script) { await script.exports.dispose(); await script.unload(); }
    if (session) await session.detach();
    assert.equal(Number(adb('shell', 'pidof', pkg)), pid);
    evidence.cleanup = {disposed: true, processAlive: true};
  } catch (error) { evidence.passed = false; evidence.cleanup = {error: String(error)}; throw error; }
  finally { adb('forward', '--remove', 'tcp:' + port); await writeFile(output + '/result.json', JSON.stringify(evidence, null, 2) + '\n'); }
}
