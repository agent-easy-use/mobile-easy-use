import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

const catalogUrl = 'https://raw.githubusercontent.com/agent-easy-use/mobile-easy-use/master/distribution/compatibility.json';
const releaseUrl = 'https://github.com/agent-easy-use/mobile-easy-use/releases/download/v0.1.0';
const artifactFiles = {
  'android-maven': [
    'com/agenteasyuse/mobile-easy-use/0.1.0/mobile-easy-use-0.1.0.aar',
    'com/agenteasyuse/mobile-easy-use/0.1.0/mobile-easy-use-0.1.0.pom',
  ],
  'ios-integration': [
    'Binaries/iphoneos/MobileEasyUse.dylib', 'Binaries/iphoneos/MobileEasyUseRuntime.dylib',
    'Binaries/iphonesimulator/MobileEasyUse.dylib', 'Binaries/iphonesimulator/MobileEasyUseRuntime.dylib',
    'Scripts/embed-mobile-easy-use.sh', 'MobileEasyUseRuntime.config',
  ],
  'ios-runner': [
    'MEUStandaloneRunner.xcodeproj/project.pbxproj',
    'MEUStandaloneRunner.xcodeproj/xcshareddata/xcschemes/MEUStandaloneRunner.xcscheme',
    'MEUStandaloneRunner/MEUStandaloneRunner.swift', 'MobileEasyUseRuntime.config',
    'scripts/embed-runtime.sh', 'Binaries/iphoneos/MobileEasyUseRuntime.dylib',
    'Binaries/iphonesimulator/MobileEasyUseRuntime.dylib',
  ],
};

function fixture(t, platform, failure = null) {
  const directory = mkdtempSync(join(tmpdir(), 'meu-public-artifacts-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const routes = {};
  const checksums = [];
  for (const [kind, paths] of Object.entries(artifactFiles)) {
    if (!kind.startsWith(platform)) continue;
    const source = join(directory, kind);
    for (const relative of paths) {
      const file = join(source, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'artifact fixture');
    }
    const name = `mobile-easy-use-${kind}-0.1.0.tar.gz`;
    const archive = join(directory, name);
    execFileSync('tar', ['-czf', archive, '-C', source, '.']);
    const bytes = readFileSync(archive);
    checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
    routes[`${releaseUrl}/${name}`] = {
      body: (failure === 'corrupt' ? Buffer.from('corrupt archive') : bytes).toString('base64'),
    };
  }
  routes[catalogUrl] = { body: Buffer.from(JSON.stringify({
    schemaVersion: 1, latestReleaseVersion: '0.1.0',
    releases: { '0.1.0': { minimumMcpVersion: '0.1.0', maximumMcpVersion: '0.1.0' } },
  })).toString('base64') };
  routes[`${releaseUrl}/SHA256SUMS`] = {
    status: failure === 'missing' ? 404 : 200,
    body: Buffer.from(checksums.join('\n')).toString('base64'),
  };
  const requests = join(directory, 'requests.jsonl');
  const preload = join(directory, 'fetch.mjs');
  writeFileSync(preload, `
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
const routes = ${JSON.stringify(routes)};
globalThis.fetch = async (url, options) => {
  assert.equal(new Headers(options.headers).has('authorization'), false);
  assert.ok(Object.hasOwn(routes, url), 'Unexpected request: ' + url);
  appendFileSync(${JSON.stringify(requests)}, JSON.stringify(url) + '\\n');
  const route = routes[url];
  return new Response(Buffer.from(route.body, 'base64'), { status: route.status ?? 200 });
};
`);
  return {
    run: () => spawnSync(process.execPath, [
      '--import', preload, resolve(`skills/to-${platform}-integrate/scripts/ensure-artifacts.mjs`),
      '--version', '0.1.0',
    ], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, MEU_HOME: join(directory, 'cache'), GITHUB_TOKEN: 'unused-test-token' },
    }),
    requests: () => readFileSync(requests, 'utf8').trim().split('\n').map(JSON.parse),
  };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: public downloads need no token or Release API and reuse the verified cache`, t => {
    const setup = fixture(t, platform);
    const result = setup.run();
    assert.equal(result.status, 0, result.stderr);
    const installed = JSON.parse(result.stdout);
    assert.equal(installed.releaseVersion, '0.1.0');
    assert.equal(installed.cacheHit, false);
    assert.equal(installed.mcpCommand, 'npx -y @agent-easy-use/mobile-easy-use@0.1.0');
    assert.deepEqual(setup.requests().map(url => basename(url)), [
      'compatibility.json', 'SHA256SUMS',
      ...(platform === 'android' ? ['android-maven'] : ['ios-integration', 'ios-runner'])
        .map(kind => `mobile-easy-use-${kind}-0.1.0.tar.gz`),
    ]);
    const requestCount = setup.requests().length;
    const cached = setup.run();
    assert.equal(cached.status, 0, cached.stderr);
    assert.equal(JSON.parse(cached.stdout).cacheHit, true);
    assert.deepEqual(setup.requests().slice(requestCount), [catalogUrl]);
  });

  for (const failure of ['corrupt', 'missing']) {
    test(`${platform}: public download rejects ${failure === 'corrupt' ? 'a checksum mismatch' : 'a missing checksum file'}`, t => {
      const setup = fixture(t, platform, failure);
      const result = setup.run();
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, failure === 'corrupt' ? /Checksum mismatch/ : /Download failed \(404/);
    });
  }
}
