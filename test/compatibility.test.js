import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CompatibilityError,
  COMPATIBILITY_TIMEOUT_MS,
  compareVersions,
  evaluateCompatibility,
  loadCompatibilityCatalog,
  validateCompatibilityCatalog,
} from '../src/compatibility.js';

const catalog = validateCompatibilityCatalog({
  schemaVersion: 1,
  latestReleaseVersion: '2.0.0',
  releases: {
    '1.0.0': { minimumMcpVersion: '1.1.0', maximumMcpVersion: '1.4.0' },
    '2.0.0': { minimumMcpVersion: '1.4.0', maximumMcpVersion: '2.0.0' },
  },
});

test('compatibility catalog timeout is capped at two seconds', () => {
  assert.equal(COMPATIBILITY_TIMEOUT_MS, 2_000);
});

test('repository Release and npm versions are represented by the distribution catalog', async () => {
  const [catalogDocument, releaseVersion, packageDocument] = await Promise.all([
    readFile('distribution/compatibility.json', 'utf8').then(JSON.parse),
    readFile('integration/VERSION', 'utf8').then((value) => value.trim()),
    readFile('package.json', 'utf8').then(JSON.parse),
  ]);
  const repositoryCatalog = validateCompatibilityCatalog(catalogDocument);
  const current = evaluateCompatibility(
    repositoryCatalog,
    releaseVersion,
    packageDocument.version,
  );

  assert.equal(repositoryCatalog.latestReleaseVersion, releaseVersion);
  assert.equal(current.compatible, true);
});

test('compatibility accepts the range and recommends its explicit maximum', () => {
  assert.deepEqual(evaluateCompatibility(catalog, '1.0.0', '1.2.0'), {
    releaseVersion: '1.0.0',
    mcpVersion: '1.2.0',
    minimumMcpVersion: '1.1.0',
    maximumMcpVersion: '1.4.0',
    mcpCommand: 'npx -y @agent-easy-use/mobile-easy-use@1.4.0',
    compatible: true,
    upgradeRecommendation: 'Upgrade MCP to 1.4.0 with: npx -y @agent-easy-use/mobile-easy-use@1.4.0',
  });
  assert.equal(evaluateCompatibility(catalog, '1.0.0', '1.4.0').upgradeRecommendation, null);
});

test('compatibility rejects MCP versions below and above the Release range', () => {
  assert.throws(
    () => evaluateCompatibility(catalog, '1.0.0', '1.0.0'),
    (error) => error instanceof CompatibilityError && error.code === 'MCP_VERSION_TOO_OLD'
      && /Upgrade MCP to 1\.4\.0/.test(error.message),
  );
  assert.throws(
    () => evaluateCompatibility(catalog, '1.0.0', '2.0.0'),
    (error) => error instanceof CompatibilityError && error.code === 'MCP_VERSION_TOO_NEW'
      && /@1\.4\.0; or re-run the latest platform integration/.test(error.message),
  );
});

test('compatibility rejects an unknown Release and invalid catalog ranges', () => {
  assert.throws(
    () => evaluateCompatibility(catalog, '3.0.0', '2.0.0'),
    (error) => error.code === 'RELEASE_NOT_SUPPORTED',
  );
  assert.throws(() => validateCompatibilityCatalog({
    schemaVersion: 1,
    latestReleaseVersion: '1.0.0',
    releases: { '1.0.0': { minimumMcpVersion: '2.0.0', maximumMcpVersion: '1.0.0' } },
  }), (error) => error.code === 'COMPATIBILITY_CATALOG_INVALID');
});

test('semantic version comparison handles prerelease and build metadata', () => {
  assert.equal(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
  assert.equal(compareVersions('1.0.0-alpha-beta', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0+one', '1.0.0+two'), 0);
});

test('compatibility catalog loading reports network and schema errors for fail-open connect handling', async () => {
  await assert.rejects(
    loadCompatibilityCatalog({ fetchImpl: async () => { throw new Error('offline'); } }),
    (error) => error.code === 'COMPATIBILITY_CATALOG_UNAVAILABLE'
      && /continuing without compatibility validation/.test(error.message),
  );
  await assert.rejects(
    loadCompatibilityCatalog({ fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      async text() { return '{}'; },
    }) }),
    (error) => error.code === 'COMPATIBILITY_CATALOG_INVALID',
  );
});
