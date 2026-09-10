import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'agent-easy-use/mobile-easy-use';
const endpoints = {
  repository: `repos/${repo}`,
  views: `repos/${repo}/traffic/views`,
  clones: `repos/${repo}/traffic/clones`,
  referrers: `repos/${repo}/traffic/popular/referrers`,
  paths: `repos/${repo}/traffic/popular/paths`,
  releases: `repos/${repo}/releases?per_page=10`,
};

async function github(endpoint) {
  const { stdout } = await exec('gh', ['api', endpoint], {
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function publicJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const jobs = [
  ...Object.entries(endpoints).map(([name, endpoint]) => [name, () => github(endpoint)]),
  ['npm', () => publicJson('https://registry.npmjs.org/@agent-easy-use%2fmobile-easy-use')],
  ['npmDownloads', () => publicJson('https://api.npmjs.org/downloads/point/last-week/@agent-easy-use/mobile-easy-use')],
];
const results = await Promise.allSettled(jobs.map(([, run]) => run()));
const data = {};
const failures = [];
for (const [index, result] of results.entries()) {
  const name = jobs[index][0];
  if (result.status === 'fulfilled') data[name] = result.value;
  else failures.push(name); // Never persist CLI stderr, credentials, or headers.
}

if (!data.repository) {
  console.error('Repository lookup failed. Check gh authentication and network access.');
  process.exitCode = 1;
} else {
  const capturedAt = new Date().toISOString();
  const summary = {
    capturedAt,
    repository: repo,
    stars: data.repository.stargazers_count,
    forks: data.repository.forks_count,
    openIssuesAndPRs: data.repository.open_issues_count,
    views14d: data.views?.count ?? null,
    uniqueVisitors14d: data.views?.uniques ?? null,
    clones14d: data.clones?.count ?? null,
    uniqueCloners14d: data.clones?.uniques ?? null,
    npmLatest: data.npm?.['dist-tags']?.latest ?? null,
    npmDownloadsLastWeek: data.npmDownloads?.downloads ?? null,
    npmDownloadWindow: data.npmDownloads
      ? { start: data.npmDownloads.start, end: data.npmDownloads.end }
      : null,
    releases: data.releases?.map(release => ({
      tag: release.tag_name,
      assets: release.assets.map(asset => ({ name: asset.name, downloads: asset.download_count })),
    })) ?? null,
    unavailable: failures,
    notes: [
      'Traffic is a rolling 14-day window; do not sum overlapping snapshots or daily unique counts.',
      'Clones, asset downloads and npm downloads include automation and maintainer activity.',
      'Referrers are aggregate signals, not attribution of individual stars.',
      'Missing metrics are null, not zero. Timestamps are UTC.',
    ],
  };
  const output = path.join(root, 'artifacts', 'growth', capturedAt.replaceAll(':', '-'));
  await mkdir(output, { recursive: true });
  const privateSnapshot = {
    ...summary,
    description: data.repository.description,
    homepage: data.repository.homepage,
    topics: data.repository.topics,
    traffic: {
      views: data.views ?? null,
      clones: data.clones ?? null,
      referrers: data.referrers ?? null,
      paths: data.paths ?? null,
    },
  };
  await writeFile(path.join(output, 'snapshot.json'), `${JSON.stringify(privateSnapshot, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, snapshot: path.join(output, 'snapshot.json') }, null, 2));
}
