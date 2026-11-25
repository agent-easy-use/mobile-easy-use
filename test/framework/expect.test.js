import assert from 'node:assert/strict';
import test from 'node:test';
import { AssertionError, createExpect } from '../../sdk/common/test/expect.js';

const expect = createExpect();

test('expect.toBe uses Object.is and not leaves the original assertion unchanged', () => {
  const object = {};
  for (const value of [object, NaN, undefined, null, 1n, true, 'text']) expect(value).toBe(value);
  assert.throws(() => expect({}).toBe({}), AssertionError);
  assert.throws(() => expect(0).toBe(-0), AssertionError);
  const assertion = expect(1);
  assertion.not.toBe(2);
  assertion.toBe(1);
  assertion.not.not.toBe(1);
  assert.throws(() => assertion.not.toBe(1), AssertionError);
});

test('expect.toEqual compares nested plain objects and ordered arrays', () => {
  expect({ first: [1, null, { text: 'a' }], second: false })
    .toEqual({ second: false, first: [1, null, { text: 'a' }] });
  for (const [actual, expected] of [
    [[1, 2], [2, 1]], [[1], [1, 2]], [{ value: 1 }, { value: '1' }],
    [{ first: null }, { second: null }], [[], {}], [null, {}], [{}, { value: 1 }],
  ]) {
    assert.throws(() => expect(actual).toEqual(expected), AssertionError);
    expect(actual).not.toEqual(expected);
  }
  expect(Object.assign(Object.create({ inherited: 1 }), { own: 2 })).toEqual({ own: 2 });
});

for (const [matcher, actual, lower, equalPasses] of [
  ['toBeGreaterThan', 2, 1, false], ['toBeGreaterThanOrEqual', 2, 1, true],
  ['toBeLessThan', 1, 2, false], ['toBeLessThanOrEqual', 1, 2, true],
]) {
  test(`expect.${matcher} checks boundaries and rejects non-finite numbers`, () => {
    expect(actual)[matcher](lower);
    expect(lower).not[matcher](actual);
    if (equalPasses) expect(actual)[matcher](actual);
    else assert.throws(() => expect(actual)[matcher](actual), AssertionError);
    for (const invalid of [NaN, Infinity, -Infinity, '1', null, 1n]) {
      assert.throws(() => expect(invalid)[matcher](actual), TypeError);
      assert.throws(() => expect(actual).not[matcher](invalid), TypeError);
    }
  });
}

test('expect.toMatch preserves RegExp state and toContain uses substring or shallow membership', () => {
  const pattern = /hello/g;
  pattern.lastIndex = 4;
  expect('hello').toMatch(pattern);
  expect('hello').toMatch(pattern);
  assert.equal(pattern.lastIndex, 4);
  expect('world').not.toMatch(pattern);
  assert.throws(() => expect(123).not.toMatch(/123/), TypeError);
  assert.throws(() => expect('hello').not.toMatch('hello'), TypeError);
  expect('hello world').toContain('world');
  const object = { value: 1 };
  expect([object, NaN]).toContain(object);
  expect([object, NaN]).toContain(NaN);
  expect([object]).not.toContain({ value: 1 });
  assert.throws(() => expect('hello').toContain('missing'), AssertionError);
  assert.throws(() => expect({}).not.toContain('key'), TypeError);
  assert.throws(() => expect('123').not.toContain(123), TypeError);
});

test('expect failures contain serializable diagnostics and the custom message', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const [actual, displayed] of [[1n, '1n'], [NaN, 'NaN'], [-0, '-0'],
    [undefined, 'undefined'], [/text/g, '/text/g'], [cyclic, '[unserializable value]']]) {
    assert.throws(() => expect(actual, 'observation').toBe(null), error => {
      assert.ok(error instanceof AssertionError);
      assert.equal(error.matcher, 'toBe');
      assert.equal(error.actual, displayed);
      assert.equal(error.expected, 'null');
      assert.match(error.message, /^observation:/);
      assert.doesNotThrow(() => JSON.stringify(error));
      return true;
    });
  }
});
