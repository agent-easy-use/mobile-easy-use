import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_EVIDENCE_DIRECTORY,
  DEFAULT_LOG_DIRECTORY,
  DEFAULT_RUN_DIRECTORY,
} from '../src/output-paths.js';

test('default logs and evidence share an isolated system temporary run directory', () => {
  const relativeToTemp = relative(resolve(tmpdir()), resolve(DEFAULT_RUN_DIRECTORY));

  assert.ok(relativeToTemp !== '');
  assert.ok(!relativeToTemp.startsWith('..'));
  assert.equal(dirname(DEFAULT_LOG_DIRECTORY), DEFAULT_RUN_DIRECTORY);
  assert.equal(dirname(DEFAULT_EVIDENCE_DIRECTORY), DEFAULT_RUN_DIRECTORY);
  assert.equal(basename(DEFAULT_LOG_DIRECTORY), '.logs');
  assert.equal(basename(DEFAULT_EVIDENCE_DIRECTORY), '.evidence');
  assert.match(basename(DEFAULT_RUN_DIRECTORY), new RegExp(`^${process.pid}-`));
});
