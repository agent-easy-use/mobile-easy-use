import { stripVTControlCharacters } from 'node:util';

const stream = process.stdout;
const interactive = Boolean(stream.isTTY && process.env.TERM !== 'dumb');
const color = interactive && process.env.NO_COLOR === undefined;
const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
const seconds = ms => `${(ms / 1000).toFixed(1)}s`;
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let active;

function clear() {
  if (interactive) stream.write('\r\x1b[2K');
}

function draw() {
  if (!active) return;
  const text = `${active.label}${active.detail ? ` · ${active.detail}` : ''}`;
  const elapsed = seconds(Date.now() - active.started);
  const width = Math.max(10, (stream.columns || 80) - elapsed.length - 8);
  const clipped = text.length > width ? `${text.slice(0, width - 1)}…` : text;
  clear();
  stream.write(`  ${paint('36', frames[active.frame++ % frames.length])} ${clipped} ${paint('2', elapsed)}`);
}

export function header(platform, suite) {
  stream.write(`\n  ${paint('1', 'MOBILE EASY USE')} ${paint('36', 'E2E')}\n`);
  stream.write(`  ${platform === 'ios' ? 'iOS' : 'Android'} ${paint('2', '›')} ${suite}\n\n`);
}

export function start(label) {
  active = { label, detail: '', started: Date.now(), frame: 0 };
  if (interactive) {
    draw();
    active.timer = setInterval(draw, 100);
    active.timer.unref();
  } else stream.write(`  → ${label}\n`);
}

export function progress(detail) {
  if (active && interactive) { active.detail = detail; draw(); }
  else stream.write(`    ${detail}\n`);
}

export function finish(ok = true) {
  if (!active) return;
  clearInterval(active.timer);
  clear();
  stream.write(`  ${paint(ok ? '32' : '31', ok ? '✓' : '✗')} ${active.label} ${paint('2', seconds(Date.now() - active.started))}\n`);
  active = undefined;
}

export async function step(label, work) {
  start(label);
  try {
    const result = await work();
    finish();
    return result;
  } catch (error) { finish(false); throw error; }
}

export function detail(text) {
  stream.write(`    ${paint('2', text)}\n`);
}

export function error(text) {
  // Keep stacks in report.json; show the actionable message in the terminal.
  const message = stripVTControlCharacters(String(text)).split('\n').filter(line => !/^\s+at /.test(line)).join('\n    ');
  stream.write(`    ${paint('31', message)}\n`);
}

export function summary(report, path, durationMs, limit = 10) {
  const tests = report.suites.flatMap(suite => suite.report?.tests ?? []);
  const count = status => tests.filter(test => test.status === status).length;
  stream.write(`\n  ${paint(report.ok ? '1;32' : '1;31', report.ok ? 'PASS' : 'FAIL')}  `
    + `${count('failed')} failed · ${count('passed')} passed · ${count('notRun')} not run ${paint('2', '(tests)')}\n`);
  const entries = tests.filter(test => test.status === 'failed' || test.status === 'passed');
  entries.sort((a, b) => Number(a.status === 'passed') - Number(b.status === 'passed'));
  if (entries.length && limit > 0) {
    stream.write('\n');
    for (const entry of entries.slice(0, limit)) {
      const passed = entry.status === 'passed';
      const name = stripVTControlCharacters(entry.test).replace(/\s+/g, ' ');
      stream.write(`  ${paint(passed ? '32' : '31', passed ? '✓' : '✗')} ${name}\n`);
      if (!passed) {
        for (const failure of entry.errors ?? []) error(`${failure.phase}: ${failure.message}`);
      }
    }
  }
  if (entries.length > limit) stream.write(`  ${paint('2', `${entries.length - limit} more tests in report.json`)}\n`);
  const unreported = report.suites.filter(suite => !suite.report);
  if (unreported.length) detail(`${unreported.length} test file(s) without a test report (failed or not run)`);
  if (report.errors.length) stream.write(`  ${paint('31', `${report.errors.length} infrastructure error(s)`)}\n`);
  stream.write(`  ${paint('2', 'Time')}    ${seconds(durationMs)}\n`);
  stream.write(`  ${paint('2', 'Report')}  ${path}\n\n`);
}
