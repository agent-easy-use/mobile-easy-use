import { createExpect } from './expect.js';

let activeRun = false;
function errorRecord(phase, error) {
  const record = {
    phase,
    name: String(error?.name ?? 'Error'),
    message: String(error?.message ?? error),
    stack: String(error?.stack ?? ''),
  };
  for (const key of ['matcher', 'actual', 'expected']) {
    if (error?.[key] !== undefined) record[key] = String(error[key]);
  }
  return record;
}

export function create(findUiView, runOnMainThread, checkUiState, screenshot) {
  const expect = createExpect(findUiView, runOnMainThread, checkUiState, screenshot);
  const groups = new Map();
  let currentGroup = null;
  function requireGroup() {
    if (activeRun) throw new Error('Cannot register tests or hooks while tests are running');
    if (!currentGroup) throw new Error('Tests and hooks must be registered inside describe');
    return currentGroup;
  }

  function describe(name, callback) {
    if (activeRun) throw new Error('Cannot register a describe while tests are running');
    if (currentGroup) throw new Error('Nested describe is not supported');
    if (groups.has(name)) throw new Error(`Duplicate describe: ${name}`);

    const group = { name, tests: new Map(), beforeEach: [], afterEach: [] };
    currentGroup = group;
    try {
      callback();
      groups.set(name, group);
    } finally {
      currentGroup = null;
    }
  }

  function test(name, callback) {
    const group = requireGroup();
    if (group.tests.has(name)) throw new Error(`Duplicate test: ${group.name} / ${name}`);
    group.tests.set(name, callback);
  }

  function registerHook(phase, callback) {
    const group = requireGroup();
    group[phase].push(callback);
  }

  function list() {
    return [...groups.values()].flatMap(group => (
      [...group.tests.keys()].map(name => ({ describe: group.name, test: name }))
    ));
  }

  async function run(selection = {}) {
    if (activeRun) throw new Error('Concurrent or nested test runs are not supported');
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)
        || Object.keys(selection).some(key => key !== 'describe' && key !== 'test')) {
      throw new TypeError('Selection must contain only describe and optional test');
    }
    if (selection.test !== undefined) {
      if (selection.describe === undefined) throw new Error('Selecting a test requires describe');
    }
    const tests = list().filter(entry => (
      (selection.describe === undefined || entry.describe === selection.describe)
      && (selection.test === undefined || entry.test === selection.test)
    )).map(entry => ({ ...entry, status: 'notRun', durationMs: 0, errors: [] }));
    if (tests.length === 0) throw new Error('No tests matched the selection');
    activeRun = true;
    try {
      for (const result of tests) {
        const group = groups.get(result.describe);
        const startedAt = Date.now();
        let phase = 'beforeEach';
        try {
          for (const hook of group.beforeEach) await hook();
          phase = 'test';
          await group.tests.get(result.test)();
        } catch (error) {
          result.errors.push(errorRecord(phase, error));
        } finally {
          for (const hook of group.afterEach) {
            try {
              await hook();
            } catch (error) {
              result.errors.push(errorRecord('afterEach', error));
            }
          }
        }
        result.durationMs = Date.now() - startedAt;
        result.status = result.errors.length === 0 ? 'passed' : 'failed';
        if (result.status === 'failed') break;
      }
    } finally {
      activeRun = false;
    }
    return {
      ok: tests.every(result => result.status === 'passed'),
      total: tests.length,
      passed: tests.filter(result => result.status === 'passed').length,
      failed: tests.filter(result => result.status === 'failed').length,
      notRun: tests.filter(result => result.status === 'notRun').length,
      tests,
    };
  }

  return {
    describe,
    test,
    beforeEach: callback => registerHook('beforeEach', callback),
    afterEach: callback => registerHook('afterEach', callback),
    expect,
    list,
    run,
  };
}
