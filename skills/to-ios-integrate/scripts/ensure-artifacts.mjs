#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repository = "agent-easy-use/mobile-easy-use";
const meuHome = resolve(process.env.MEU_HOME || join(homedir(), ".meu"));
const catalogUrl = `https://raw.githubusercontent.com/${repository}/master/distribution/compatibility.json`;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const maxCatalogBytes = 64 * 1024;
const requestTimeoutMs = 30_000;
const releaseAssetDownloadTimeoutMs = 10 * 60_000;
const integrationRequiredPaths = [
  ["Binaries", "iphoneos", "MobileEasyUse.dylib"],
  ["Binaries", "iphoneos", "MobileEasyUseRuntime.dylib"],
  ["Binaries", "iphonesimulator", "MobileEasyUse.dylib"],
  ["Binaries", "iphonesimulator", "MobileEasyUseRuntime.dylib"],
  ["Scripts", "embed-mobile-easy-use.sh"],
  ["MobileEasyUseRuntime.config"],
];
const runnerRequiredPaths = [
  ["MEUStandaloneRunner.xcodeproj", "project.pbxproj"],
  ["MEUStandaloneRunner.xcodeproj", "xcshareddata", "xcschemes", "MEUStandaloneRunner.xcscheme"],
  ["MEUStandaloneRunner", "MEUStandaloneRunner.swift"],
  ["MobileEasyUseRuntime.config"],
  ["scripts", "embed-runtime.sh"],
  ["Binaries", "iphoneos", "MobileEasyUseRuntime.dylib"],
  ["Binaries", "iphonesimulator", "MobileEasyUseRuntime.dylib"],
];

async function fetchChecked(url, timeoutMs = requestTimeoutMs) {
  const response = await fetch(url, {
    headers: { "User-Agent": "mobile-easy-use-artifact-installer" },
    redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  return response;
}

async function loadCatalog() {
  const response = await fetchChecked(catalogUrl);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxCatalogBytes) {
    throw new Error("The compatibility catalog is too large.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > maxCatalogBytes) throw new Error("The compatibility catalog is too large.");
  return validateCatalog(JSON.parse(text));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function download(url, destination) {
  const temporary = `${destination}.part-${process.pid}`;
  await rm(temporary, { force: true });
  const response = await fetchChecked(url, releaseAssetDownloadTimeoutMs);
  if (!response.body) throw new Error(`The response has no body: ${url}`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

function parseChecksums(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match) values.set(basename(match[2].trim()), match[1].toLowerCase());
  }
  return values;
}

async function extractTarGz(archive, destination) {
  const staging = `${destination}.staging-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    const tar = process.platform === "win32" ? "tar.exe" : "tar";
    await execFileAsync(tar, ["-xzf", archive, "-C", staging]);
    await mkdir(destination, { recursive: true });
    await cp(staging, destination, { recursive: true, force: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("A tar extractor is required. Install bsdtar/tar and make it available on PATH.");
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const options = { update: false, useCached: false, version: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--update") options.update = true;
    else if (argument === "--use-cached") options.useCached = true;
    else if (argument === "--version" && argv[index + 1]) options.version = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if ([options.update, options.useCached, options.version !== null].filter(Boolean).length > 1) {
    throw new Error("Use only one of --update, --use-cached, or --version.");
  }
  return options;
}

function compareVersions(left, right) {
  const parse = (value) => {
    const withoutBuild = value.split("+")[0];
    const separator = withoutBuild.indexOf("-");
    const core = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
    const prerelease = separator === -1 ? [] : withoutBuild.slice(separator + 1).split(".");
    return { core: core.split(".").map(Number), prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : (a.prerelease.length === 0 ? 1 : -1);
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    if (a.prerelease[index] === b.prerelease[index]) continue;
    const aNumeric = /^\d+$/.test(a.prerelease[index]);
    const bNumeric = /^\d+$/.test(b.prerelease[index]);
    if (aNumeric && bNumeric) return Number(a.prerelease[index]) - Number(b.prerelease[index]);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a.prerelease[index].localeCompare(b.prerelease[index]);
  }
  return 0;
}

function validateCatalog(value) {
  if (value?.schemaVersion !== 1 || !versionPattern.test(value.latestReleaseVersion)
      || value.releases === null || typeof value.releases !== "object"
      || !(value.latestReleaseVersion in value.releases)) {
    throw new Error("The compatibility catalog has an unsupported schema.");
  }
  for (const [version, range] of Object.entries(value.releases)) {
    if (!versionPattern.test(version) || !versionPattern.test(range?.minimumMcpVersion)
        || !versionPattern.test(range?.maximumMcpVersion)
        || compareVersions(range.minimumMcpVersion, range.maximumMcpVersion) > 0) {
      throw new Error(`The compatibility catalog has an invalid range for ${version}.`);
    }
  }
  return value;
}

async function cachedVersions(catalog) {
  const root = join(meuHome, "ios");
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const versions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !(entry.name in catalog.releases)) continue;
    if (await cachedArtifact(entry.name) !== null) versions.push(entry.name);
  }
  return versions.sort(compareVersions).reverse();
}

async function cachedArtifact(version) {
  const base = join(meuHome, "ios", version);
  const integrationPath = join(base, "integration");
  const runnerPath = join(base, "runner");
  const requiredPaths = [
    ...integrationRequiredPaths.map((parts) => join(integrationPath, ...parts)),
    ...runnerRequiredPaths.map((parts) => join(runnerPath, ...parts)),
  ];
  return (await Promise.all(requiredPaths.map(exists))).every(Boolean)
    ? { integrationPath, runnerPath }
    : null;
}

function resultFor(version, catalog, paths, cacheHit, tag = `v${version}`) {
  return {
    platform: "ios", version, releaseVersion: version, tag, meuHome,
    integrationPath: paths.integrationPath, runnerPath: paths.runnerPath, cacheHit,
    latestReleaseVersion: catalog.latestReleaseVersion,
    minimumMcpVersion: catalog.releases[version].minimumMcpVersion,
    maximumMcpVersion: catalog.releases[version].maximumMcpVersion,
    mcpCommand: `npx -y @agent-easy-use/mobile-easy-use@${catalog.releases[version].maximumMcpVersion}`,
  };
}

async function installAsset({ releaseUrl, checksums, tag, version, kind, requiredRelativePaths }) {
  const assetName = `mobile-easy-use-ios-${kind}-${version}.tar.gz`;
  const expectedSha = checksums.get(assetName);
  if (!expectedSha) throw new Error(`Release ${tag} is missing the checksum for ${assetName}.`);

  const destination = join(meuHome, "ios", version, kind);
  const requiredPaths = requiredRelativePaths.map((path) => join(destination, ...path));
  const downloads = join(meuHome, "downloads");
  const archive = join(downloads, assetName);
  await mkdir(downloads, { recursive: true });
  if (!(await exists(archive)) || (await sha256(archive)) !== expectedSha) {
    await download(`${releaseUrl}/${encodeURIComponent(assetName)}`, archive);
  }
  const actualSha = await sha256(archive);
  if (actualSha !== expectedSha) {
    await rm(archive, { force: true });
    throw new Error(`Checksum mismatch for ${assetName}: expected ${expectedSha}, received ${actualSha}`);
  }

  await extractTarGz(archive, destination);
  if (!(await Promise.all(requiredPaths.map(exists))).every(Boolean)) {
    throw new Error(`The extracted iOS ${kind} artifact is incomplete: ${destination}`);
  }
  return { path: destination, cacheHit: false };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = await loadCatalog();
  const cached = await cachedVersions(catalog);
  const latest = catalog.latestReleaseVersion;
  let version = options.version;
  if (version !== null && !(version in catalog.releases)) {
    throw new Error(`Release ${version} is not present in the compatibility catalog.`);
  }
  if (version === null && options.update) version = latest;
  if (version === null && options.useCached) {
    if (cached.length === 0) throw new Error("No cached iOS Release is available.");
    [version] = cached;
  }
  if (version === null && cached.includes(latest)) version = latest;
  if (version === null && cached.length === 0) version = latest;
  if (version === null) {
    const [cachedVersion] = cached;
    process.stdout.write(`${JSON.stringify({
      platform: "ios", actionRequired: "confirm-update", cachedVersion,
      latestReleaseVersion: latest, meuHome,
    })}\n`);
    return;
  }

  const existing = await cachedArtifact(version);
  if (existing !== null) {
    process.stdout.write(`${JSON.stringify(resultFor(version, catalog, existing, true))}\n`);
    return;
  }

  const tag = `v${version}`;
  const releaseUrl = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`;
  const checksums = parseChecksums(await (await fetchChecked(`${releaseUrl}/SHA256SUMS`)).text());

  const integration = await installAsset({
    releaseUrl,
    checksums,
    tag,
    version,
    kind: "integration",
    requiredRelativePaths: integrationRequiredPaths,
  });
  const runner = await installAsset({
    releaseUrl,
    checksums,
    tag,
    version,
    kind: "runner",
    requiredRelativePaths: runnerRequiredPaths,
  });

  process.stdout.write(`${JSON.stringify(resultFor(version, catalog, {
    integrationPath: integration.path, runnerPath: runner.path,
  }, integration.cacheHit && runner.cacheHit, tag))}\n`);
}

main().catch((error) => {
  process.stderr.write(`mobile-easy-use: ${error.message}\n`);
  process.exitCode = 1;
});
