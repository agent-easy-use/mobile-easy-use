import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

function render(limit) {
  const report = { ok: false, errors: [], suites: [{ status: 'failed', report: { tests: [
    ...Array.from({ length: 12 }, (_, i) => ({ test: `success-${i}`, status: 'passed', errors: [] })),
    { test: 'failure-last', status: 'failed', errors: [{ phase: 'test', message: 'Click completed: Expected false toBe true' }] },
    { test: 'not-executed', status: 'notRun', errors: [] },
  ] } }] };
  return execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { summary } from './test/e2e/output.mjs'; summary(${JSON.stringify(report)}, 'report.json', 100, ${limit});`],
  { cwd: new URL('../..', import.meta.url), encoding: 'utf8' });
}

test('terminal lists failed tests first and limits combined results without ANSI in pipes', () => {
  const output = render(10);
  assert.ok(output.indexOf('failure-last') < output.indexOf('success-0'));
  assert.equal((output.match(/^  [✓✗] /gm) ?? []).length, 10);
  assert.match(output, /3 more tests/);
  assert.ok(!output.includes('\x1b'));
  assert.match(output, /1 failed · 12 passed · 1 not run/);
  assert.match(output, /test: Click completed: Expected false toBe true/);
  assert.ok(!render(0).includes('Click completed'));
  assert.equal((render(2).match(/^  [✓✗] /gm) ?? []).length, 2);
  assert.equal((render(0).match(/^  [✓✗] /gm) ?? []).length, 0);
});
