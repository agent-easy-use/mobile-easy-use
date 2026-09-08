import { readFileSync } from 'node:fs';

const packageDocument = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

export const MCP_VERSION = packageDocument.version;
