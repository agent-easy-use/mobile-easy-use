import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_RUN_DIRECTORY = join(
  tmpdir(),
  'mobile-easy-use',
  'runs',
  `${process.pid}-${randomUUID()}`,
);

export const DEFAULT_LOG_DIRECTORY = join(DEFAULT_RUN_DIRECTORY, '.logs');
export const DEFAULT_EVIDENCE_DIRECTORY = join(DEFAULT_RUN_DIRECTORY, '.evidence');
