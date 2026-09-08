import { MCP_VERSION } from './package-info.js';

export const COMPATIBILITY_URL =
  'https://raw.githubusercontent.com/agent-easy-use/mobile-easy-use/master/distribution/compatibility.json';
export const COMPATIBILITY_TIMEOUT_MS = 2_000;

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_CATALOG_BYTES = 64 * 1024;

export class CompatibilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CompatibilityError';
    this.code = code;
    this.details = details;
  }
}

export async function loadCompatibilityCatalog({
  fetchImpl = globalThis.fetch,
  url = COMPATIBILITY_URL,
  timeoutMs = COMPATIBILITY_TIMEOUT_MS,
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'mobile-easy-use-mcp' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new CompatibilityError(
      'COMPATIBILITY_CATALOG_UNAVAILABLE',
      `Unable to fetch the MobileEasyUse compatibility catalog; continuing without compatibility validation: ${error.message}`,
    );
  }
  if (!response.ok) {
    throw new CompatibilityError(
      'COMPATIBILITY_CATALOG_UNAVAILABLE',
      `Unable to fetch the MobileEasyUse compatibility catalog; continuing without compatibility validation (${response.status}).`,
    );
  }
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_CATALOG_BYTES) {
    throw new CompatibilityError('COMPATIBILITY_CATALOG_INVALID', 'Compatibility catalog is too large.');
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    throw new CompatibilityError(
      'COMPATIBILITY_CATALOG_UNAVAILABLE',
      `Unable to read the MobileEasyUse compatibility catalog; continue without it: ${error.message}`,
    );
  }
  if (Buffer.byteLength(text) > MAX_CATALOG_BYTES) {
    throw new CompatibilityError('COMPATIBILITY_CATALOG_INVALID', 'Compatibility catalog is too large.');
  }
  try {
    return validateCompatibilityCatalog(JSON.parse(text));
  } catch (error) {
    if (error instanceof CompatibilityError) throw error;
    throw new CompatibilityError(
      'COMPATIBILITY_CATALOG_INVALID',
      `Compatibility catalog is invalid: ${error.message}`,
    );
  }
}

export function validateCompatibilityCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !isVersion(catalog.latestReleaseVersion)
      || catalog.releases === null || typeof catalog.releases !== 'object'
      || Array.isArray(catalog.releases)) {
    throw new CompatibilityError('COMPATIBILITY_CATALOG_INVALID', 'Compatibility catalog has an unsupported schema.');
  }
  for (const [releaseVersion, range] of Object.entries(catalog.releases)) {
    if (!isVersion(releaseVersion) || !isVersion(range?.minimumMcpVersion)
        || !isVersion(range?.maximumMcpVersion)
        || compareVersions(range.minimumMcpVersion, range.maximumMcpVersion) > 0) {
      throw new CompatibilityError('COMPATIBILITY_CATALOG_INVALID', `Invalid compatibility range for Release ${releaseVersion}.`);
    }
  }
  if (!(catalog.latestReleaseVersion in catalog.releases)) {
    throw new CompatibilityError('COMPATIBILITY_CATALOG_INVALID', 'latestReleaseVersion is missing from releases.');
  }
  return catalog;
}

export function evaluateCompatibility(catalog, releaseVersion, mcpVersion = MCP_VERSION) {
  if (!isVersion(releaseVersion)) {
    throw new CompatibilityError('RELEASE_VERSION_UNAVAILABLE', 'The App runtime did not report a valid MobileEasyUse Release version.');
  }
  const range = catalog.releases[releaseVersion];
  if (!range) {
    throw new CompatibilityError(
      'RELEASE_NOT_SUPPORTED',
      `MobileEasyUse Release ${releaseVersion} is not present in the compatibility catalog. Re-run the latest integration.`,
      { releaseVersion, mcpVersion },
    );
  }
  const mcpCommand = `npx -y @agent-easy-use/mobile-easy-use@${range.maximumMcpVersion}`;
  const details = { releaseVersion, mcpVersion, ...range, mcpCommand };
  if (compareVersions(mcpVersion, range.minimumMcpVersion) < 0) {
    throw new CompatibilityError(
      'MCP_VERSION_TOO_OLD',
      `MCP ${mcpVersion} is older than Release ${releaseVersion} supports. Upgrade MCP to ${range.maximumMcpVersion} with: ${mcpCommand}`,
      details,
    );
  }
  if (compareVersions(mcpVersion, range.maximumMcpVersion) > 0) {
    throw new CompatibilityError(
      'MCP_VERSION_TOO_NEW',
      `MCP ${mcpVersion} is newer than Release ${releaseVersion} supports. Downgrade MCP with: ${mcpCommand}; or re-run the latest platform integration.`,
      details,
    );
  }
  return {
    ...details,
    compatible: true,
    upgradeRecommendation: compareVersions(mcpVersion, range.maximumMcpVersion) < 0
      ? `Upgrade MCP to ${range.maximumMcpVersion} with: ${mcpCommand}`
      : null,
  };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  }
  if (a.pre.length === 0 || b.pre.length === 0) {
    return a.pre.length === b.pre.length ? 0 : (a.pre.length === 0 ? 1 : -1);
  }
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    if (a.pre[index] === undefined) return -1;
    if (b.pre[index] === undefined) return 1;
    if (a.pre[index] === b.pre[index]) continue;
    const aNumber = /^\d+$/.test(a.pre[index]);
    const bNumber = /^\d+$/.test(b.pre[index]);
    if (aNumber && bNumber) return Number(a.pre[index]) < Number(b.pre[index]) ? -1 : 1;
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a.pre[index] < b.pre[index] ? -1 : 1;
  }
  return 0;
}

function isVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

function parseVersion(value) {
  if (!isVersion(value)) throw new Error(`Invalid semantic version: ${value}`);
  const [withoutBuild] = value.split('+');
  const separator = withoutBuild.indexOf('-');
  const core = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
  const prerelease = separator === -1 ? '' : withoutBuild.slice(separator + 1);
  return { core: core.split('.').map(Number), pre: prerelease === '' ? [] : prerelease.split('.') };
}
