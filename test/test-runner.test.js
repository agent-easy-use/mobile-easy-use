import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from '../sdk/common/test/index.js';

test('Test registers isolated groups in declaration order and rejects invalid registration', () => {
  const suite = create();
  for (const method of ['test', 'beforeEach', 'afterEach']) {
    assert.throws(() => suite[method]('outside', () => {}), /inside describe/);
  }
  suite.describe('first', () => {
    suite.test('same', () => {});
    assert.throws(() => suite.test('same', () => {}), /Duplicate test/);
    assert.throws(() => suite.describe('nested', () => {}), /Nested describe/);
  });
  suite.describe('second', () => suite.test('same', () => {}));
  assert.throws(() => suite.describe('first', () => {}), /Duplicate describe/);
  assert.throws(() => suite.describe('discarded', () => {
    suite.test('partial', () => {});
    throw new Error('registration failed');
  }), /registration failed/);
  const expected = [
    { describe: 'first', test: 'same' },
    { describe: 'second', test: 'same' },
  ];
  assert.deepEqual(suite.list(), expected);
  suite.list()[0].test = 'changed';
  assert.deepEqual(suite.list(), expected);
  assert.deepEqual(create().list(), []);
});

test('Test selects all, a group or an exact case and can run repeatedly', async () => {
  const suite = create();
  const calls = [];
  for (const group of ['first', 'second']) {
    suite.describe(group, () => {
      for (const name of ['one', 'two']) {
        suite.test(name, async () => {
          await Promise.resolve();
          calls.push(`${group}/${name}`);
          return false;
        });
      }
    });
  }
  for (const [selection, expected] of [
    [undefined, ['first/one', 'first/two', 'second/one', 'second/two']],
    [{}, ['first/one', 'first/two', 'second/one', 'second/two']],
    [{ describe: 'second' }, ['second/one', 'second/two']],
    [{ describe: 'first', test: 'two' }, ['first/two']],
  ]) {
    calls.length = 0;
    const report = await suite.run(selection);
    assert.deepEqual(calls, expected);
    assert.equal(report.ok, true);
    assert.equal(report.total, expected.length);
    assert.equal(report.passed, expected.length);
    assert.equal(report.failed, 0);
    assert.equal(report.notRun, 0);
    assert.ok(report.tests.every(result => result.status === 'passed'
      && result.durationMs >= 0 && result.errors.length === 0));
  }
  for (const selection of [null, [], 'first', { name: 'one' }, { test: 'one' },
    { describe: 'unknown' }, { describe: 'first', test: 'unknown' }]) {
    await assert.rejects(suite.run(selection));
  }
  await assert.rejects(create().run(), /No tests matched/);
});

test('Test awaits group-local hooks in order and stops after failure', async () => {
  const suite = create();
  const calls = [];
  suite.describe('first', () => {
    suite.beforeEach(async () => { await Promise.resolve(); calls.push('before-one'); });
    suite.beforeEach(() => calls.push('before-two'));
    suite.afterEach(async () => { await Promise.resolve(); calls.push('after-one'); });
    suite.afterEach(() => calls.push('after-two'));
    suite.test('pass', () => calls.push('pass'));
    suite.test('fail', () => suite.expect(1, 'count').toBe(2));
    suite.test('skipped', () => calls.push('skipped'));
  });
  suite.describe('second', () => {
    suite.beforeEach(() => calls.push('other-hook'));
    suite.test('skipped', () => calls.push('other-test'));
  });
  const report = await suite.run();
  assert.deepEqual(calls, ['before-one', 'before-two', 'pass', 'after-one', 'after-two',
    'before-one', 'before-two', 'after-one', 'after-two']);
  assert.deepEqual([report.ok, report.total, report.passed, report.failed, report.notRun],
    [false, 4, 1, 1, 2]);
  assert.deepEqual(report.tests.map(result => result.status), ['passed', 'failed', 'notRun', 'notRun']);
  const failure = report.tests[1].errors[0];
  assert.equal(failure.phase, 'test');
  assert.equal(failure.name, 'AssertionError');
  assert.equal(failure.matcher, 'toBe');
  assert.equal(failure.actual, '1');
  assert.equal(failure.expected, '2');
  assert.match(failure.message, /^count:/);
  assert.match(failure.stack, /AssertionError/);
  assert.doesNotThrow(() => JSON.stringify(report));
});

for (const failurePhase of ['beforeEach', 'test', 'afterEach']) {
  test(`Test preserves ${failurePhase} errors and attempts every cleanup`, async () => {
    const suite = create();
    const calls = [];
    suite.describe('group', () => {
      suite.beforeEach(async () => {
        if (failurePhase === 'beforeEach') throw new Error('setup failed');
      });
      suite.beforeEach(() => calls.push('setup-completed'));
      suite.test('case', async () => {
        calls.push('body');
        if (failurePhase === 'test') throw new Error('body failed');
      });
      suite.afterEach(async () => { throw new Error('cleanup failed'); });
      suite.afterEach(() => { calls.push('last-cleanup'); throw 'cleanup string'; });
    });
    const report = await suite.run();
    assert.equal(report.ok, false);
    assert.deepEqual(calls, failurePhase === 'beforeEach'
      ? ['last-cleanup'] : ['setup-completed', 'body', 'last-cleanup']);
    assert.deepEqual(report.tests[0].errors.map(error => error.phase),
      failurePhase === 'afterEach' ? ['afterEach', 'afterEach']
        : [failurePhase, 'afterEach', 'afterEach']);
    assert.equal(report.tests[0].errors.at(-1).message, 'cleanup string');
    assert.equal(report.tests[0].errors.at(-1).stack, '');
  });
}

test('Test rejects concurrent runs and registration across collections, then releases the guard', async () => {
  const suite = create();
  const other = create();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  suite.describe('group', () => suite.test('case', async () => {
    await pending;
    throw new Error('body failed');
  }));
  other.describe('other', () => other.test('case', () => {}));
  const running = suite.run();
  try {
    await assert.rejects(suite.run(), /Concurrent or nested/);
    await assert.rejects(other.run(), /Concurrent or nested/);
    for (const collection of [suite, other]) {
      assert.throws(() => collection.describe('late', () => {}), /running/);
      assert.throws(() => collection.test('late', () => {}), /running/);
      assert.throws(() => collection.beforeEach(() => {}), /running/);
      assert.throws(() => collection.afterEach(() => {}), /running/);
    }
  } finally {
    release();
    await running;
  }
  assert.equal((await running).ok, false);
  other.describe('after', () => other.test('case', () => {}));
  assert.equal((await other.run()).ok, true);
});

test('Test reports nested runs and asynchronous UI assertion failures without hanging', async () => {
  const suite = create(() => ({}), async work => work(), () => false);
  suite.describe('group', () => {
    suite.test('nested', () => suite.run());
    suite.test('ui', () => suite.expect('target').toBeVisible());
    suite.test('predicate', () => suite.expect('target').toSatisfy(async () => false));
  });
  const nested = await suite.run({ describe: 'group', test: 'nested' });
  assert.match(nested.tests[0].errors[0].message, /Concurrent or nested/);
  for (const name of ['ui', 'predicate']) {
    const report = await suite.run({ describe: 'group', test: name });
    assert.equal(report.ok, false);
    assert.equal(report.tests[0].errors[0].name, 'AssertionError');
  }
});
