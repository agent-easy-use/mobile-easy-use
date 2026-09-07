#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repository = "agent-easy-use/mobile-easy-use";
const meuHome = resolve(process.env.MEU_HOME || join(homedir(), ".meu"));

function requestHeaders(binary = false) {
  const headers = {
    Accept: binary ? "application/octet-stream" : "application/vnd.github+json",
    "User-Agent": "mobile-easy-use-artifact-installer",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchChecked(url, binary = false) {
  const response = await fetch(url, { headers: requestHeaders(binary), redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response;
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
  const response = await fetchChecked(url, true);
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

async function markerMatches(markerPath, expectedSha, requiredPaths) {
  try {
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    if (marker.sha256 !== expectedSha) return false;
    return (await Promise.all(requiredPaths.map(exists))).every(Boolean);
  } catch {
    return false;
  }
}

async function main() {
  const release = await (await fetchChecked(`https://api.github.com/repos/${repository}/releases/latest`)).json();
  const tag = String(release.tag_name || "");
  const version = tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Unsupported latest release tag: ${tag || "<missing>"}`);
  }

  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  const checksumAsset = assets.get("SHA256SUMS");
  if (!checksumAsset) throw new Error(`Release ${tag} does not contain SHA256SUMS.`);
  const checksums = parseChecksums(await (await fetchChecked(checksumAsset.url, true)).text());

  const assetName = `mobile-easy-use-android-maven-${version}.tar.gz`;
  const asset = assets.get(assetName);
  const expectedSha = checksums.get(assetName);
  if (!asset || !expectedSha) throw new Error(`Release ${tag} is missing ${assetName} or its checksum.`);

  const repositoryPath = join(meuHome, "android", "maven");
  const artifactBase = join(repositoryPath, "com", "agenteasyuse", "mobile-easy-use", version);
  const requiredPaths = [
    join(artifactBase, `mobile-easy-use-${version}.aar`),
    join(artifactBase, `mobile-easy-use-${version}.pom`),
  ];
  const markerPath = join(repositoryPath, `.mobile-easy-use-${version}.json`);
  let cacheHit = await markerMatches(markerPath, expectedSha, requiredPaths);

  if (!cacheHit) {
    const downloads = join(meuHome, "downloads");
    const archive = join(downloads, assetName);
    await mkdir(downloads, { recursive: true });
    if (!(await exists(archive)) || (await sha256(archive)) !== expectedSha) {
      await download(asset.url, archive);
    }
    const actualSha = await sha256(archive);
    if (actualSha !== expectedSha) {
      await rm(archive, { force: true });
      throw new Error(`Checksum mismatch for ${assetName}: expected ${expectedSha}, received ${actualSha}`);
    }
    await extractTarGz(archive, repositoryPath);
    if (!(await Promise.all(requiredPaths.map(exists))).every(Boolean)) {
      throw new Error(`The extracted Android artifact is incomplete: ${repositoryPath}`);
    }
    await writeFile(markerPath, `${JSON.stringify({ repository, tag, version, asset: assetName, sha256: expectedSha }, null, 2)}\n`);
    cacheHit = false;
  }

  process.stdout.write(`${JSON.stringify({ platform: "android", version, tag, meuHome, repositoryPath, artifactPath: requiredPaths[0], cacheHit })}\n`);
}

main().catch((error) => {
  process.stderr.write(`mobile-easy-use: ${error.message}\n`);
  process.exitCode = 1;
});
