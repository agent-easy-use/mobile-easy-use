import Java from 'frida-java-bridge';
import { registerBreakpoint } from '../../../../../../sdk/android/common/debugger/index.js';
import { backend, check, readVariable } from '../../../../../../sdk/android/common/debugger/native.js';
import { breakpoint, className, reset, runNative } from './helpers/fixture.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const removals = [];

// This suite tests the resource layer directly; public capture/write behavior lives in inspect/override suites.
function register(onHit, onFinish) {
  let remove;
  Java.performNow(() => {
    const method = Java.use(className).sequence.overload('int');
    remove = registerBreakpoint(method, breakpoint().fileLine, { onHit, onFinish });
  });
  removals.push(remove);
  return remove;
}

describe('JVMTI breakpoint resources', () => {
  beforeEach(reset);
  afterEach(async () => {
    const results = await Promise.allSettled(removals.splice(0).map(remove => remove()));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  });

  test('each native hit reaches onHit then onFinish without changing App behavior', async () => {
    const events = [];
    const remove = register(hit => events.push(['hit', hit.toString()]), (hit, error) => {
      events.push(['finish', hit.toString(), error]);
    });
    expect((await runNative()).values).toEqual(['12']);
    await remove();
    expect(events.length).toBe(2);
    expect(events[0][0]).toBe('hit');
    expect(events[1]).toEqual(['finish', events[0][1], 0]);
    reset();
    await runNative();
    expect(events.length).toBe(2);
  });

  test('same-location registrations survive peer removal', async () => {
    let firstHits = 0, secondHits = 0;
    const errors = [];
    const finish = (_hit, error) => { if (error) errors.push(error); };
    const first = register(() => firstHits++, finish);
    const second = register(() => secondHits++, finish);
    await runNative('sequence', 2);
    await first();
    reset();
    await runNative('sequence', 2);
    await second();
    expect(firstHits).toBe(2);
    expect(secondHits).toBe(4);
    expect(errors).toEqual([]);
  });

  test('concurrent hits finish before repeated removal resolves', async () => {
    const inputs = [], errors = [];
    let finished = 0;
    let api, factory;
    Java.performNow(() => {
      api = backend();
      factory = Java.ClassFactory.get(Java.use(className).class.getClassLoader());
    });
    const remove = register(hit => inputs.push(readVariable(api, hit, 'input', factory)), (_hit, error) => {
      finished++;
      if (error) errors.push(error);
    });
    const state = await runNative('concurrent', 5);
    await Promise.all([remove(), remove()]);
    expect(inputs.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(finished).toBe(20);
    expect(state.tail).toBe(20);
    expect(errors).toEqual([]);
    reset();
    expect((await runNative()).values).toEqual(['12']);
    await remove();
    expect(finished).toBe(20);
  });

  test('a failed registration does not prevent a later valid breakpoint', async () => {
    let message;
    Java.performNow(() => {
      try {
        registerBreakpoint(Java.use(className).sequence.overload('int'), 2147483647,
          { onHit() {}, onFinish() {} });
      } catch (error) { message = error.message; }
    });
    expect(message).toMatch(/executable location/);
    let hits = 0;
    const remove = register(() => hits++, (_hit, error) => check(error, 'Finish test breakpoint'));
    expect((await runNative()).values).toEqual(['12']);
    await remove();
    expect(hits).toBe(1);
  });
});
