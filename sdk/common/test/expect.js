import { requestController } from '../controller.js';

function display(value) {
  if (value instanceof RegExp) return String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Object.is(value, -0)) return '-0';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable value]';
  }
}

function deepEqual(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (actual === null || expected === null) return false;
  if (typeof actual !== 'object' || typeof expected !== 'object') return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  if (Array.isArray(actual) && actual.length !== expected.length) return false;

  const keys = Object.keys(actual);
  return keys.length === Object.keys(expected).length
    && keys.every(key =>
      Object.hasOwn(expected, key)
      && deepEqual(actual[key], expected[key])
    );
}

export class AssertionError extends Error {
  constructor(matcher, actual, expected, negate, message) {
    actual = display(actual);
    expected = display(expected);
    super(`${message ? `${message}: ` : ''}Expected ${actual} ${negate ? 'not ' : ''}${matcher} ${expected}`);
    this.name = 'AssertionError';
    this.matcher = matcher;
    this.actual = actual;
    this.expected = expected;
  }
}

function compareNumbers(actual, expected, compare) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    throw new TypeError('Numeric comparisons require finite numbers');
  }
  return compare(actual, expected);
}

const matchers = {
  toBe: Object.is,
  toEqual: deepEqual,
  toBeGreaterThan: (actual, expected) => compareNumbers(actual, expected, (left, right) => left > right),
  toBeGreaterThanOrEqual: (actual, expected) => compareNumbers(actual, expected, (left, right) => left >= right),
  toBeLessThan: (actual, expected) => compareNumbers(actual, expected, (left, right) => left < right),
  toBeLessThanOrEqual: (actual, expected) => compareNumbers(actual, expected, (left, right) => left <= right),
  toMatch(actual, expected) {
    if (!(expected instanceof RegExp)) throw new TypeError('toMatch requires a RegExp');
    if (typeof actual !== 'string') throw new TypeError('toMatch requires a string observation');
    return new RegExp(expected.source, expected.flags).test(actual);
  },
  toContain(actual, expected) {
    if (!Array.isArray(actual) && !(typeof actual === 'string' && typeof expected === 'string')) {
      throw new TypeError('toContain requires an array, or two strings');
    }
    return actual.includes(expected);
  },
};

export function createExpect(findUiView, runOnMainThread, checkUiState, screenshot) {
  const uiMatchers = {
    toExist: view => checkUiState(view, 'exists'),
    toBeVisible: view => checkUiState(view, 'visible'),
    toBeHidden: view => checkUiState(view, 'hidden'),
    toBeFocused: view => checkUiState(view, 'focused'),
    toBeEnabled: view => checkUiState(view, 'enabled'),
    toSatisfy(view, predicate) {
      if (typeof predicate !== 'function') throw new TypeError('toSatisfy requires a predicate');
      if (view === null) throw new Error('UI target not found');
      return predicate(view);
    },
  };
  function assertions(actual, message, negate = false) {
    function check(matches, name, expected, detail = message, observation = actual) {
      if (typeof matches !== 'boolean') throw new TypeError(`${name} must produce a boolean result`);
      if (matches === negate) throw new AssertionError(name, observation, expected, negate, detail);
    }
    const methods = Object.fromEntries(Object.entries(matchers).map(([name, compare]) => [
      name, expected => check(compare(actual, expected), name, expected),
    ]));
    for (const [name, compare] of Object.entries(uiMatchers)) {
      methods[name] = async expected => {
        const matches = await runOnMainThread(() => compare(findUiView(actual), expected));
        check(matches, name, true);
      };
    }
    async function checkScreenshot(name, shot, actualPath, baselinePath, options) {
      if (shot?.ok !== true) throw new Error(shot?.error?.message ?? 'Screenshot capture failed');
      if (typeof actualPath !== 'string' || actualPath.length === 0) {
        throw new Error('Screenshot capture did not return the requested image');
      }
      const { ok, responsePayload } = await requestController('screenshot.compare', {
        actualPath, baselinePath, options,
      });
      if (!ok) throw new Error(responsePayload.error.message);
      const detail = [message, responsePayload.message].filter(Boolean).join(': ');
      check(responsePayload.matches, name, responsePayload.baselinePath ?? baselinePath, detail, actualPath);
    }
    methods.toHaveElementScreenShot = async (baselinePath, options = {}) => {
      if (actual == null) throw new TypeError('toHaveElementScreenShot requires a UI target');
      const shot = await screenshot({ includeWindow: false, targets: { element: actual } });
      await checkScreenshot('toHaveElementScreenShot', shot, shot?.targets?.element, baselinePath, options);
    };
    methods.toHaveWindowScreenShot = async (baselinePath, options = {}) => {
      if (actual !== undefined) {
        throw new TypeError('Use expect().toHaveWindowScreenShot for the current window');
      }
      const shot = await screenshot({ includeWindow: true });
      await checkScreenshot('toHaveWindowScreenShot', shot, shot?.window, baselinePath, options);
    };
    Object.defineProperty(methods, 'not', { get: () => assertions(actual, message, !negate) });
    return methods;
  }

  return (actual, message) => assertions(actual, message);
}
