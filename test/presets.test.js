import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { runBuild as buildAndroid } from '../skills/to-android-presets/scripts/build-presets.mjs';
import { runBuild as buildIOS } from '../skills/to-ios-presets/scripts/build-presets.mjs';
import { loadPresetsSource } from '../src/sdk-source.js';

async function project(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'meu presets test '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function configure(root, directory) {
  await mkdir(resolve(root, '.meu'), { recursive: true });
  const config = JSON.stringify({ other: true, presets: { directory } });
  await writeFile(resolve(root, '.meu/config.json'), config);
  return config;
}

for (const [platform, runBuild] of [['android', buildAndroid], ['ios', buildIOS]]) {
  test(`${platform}: build only reads configuration and never initializes missing files`, async t => {
    const root = await project(t);
    t.mock.method(process, 'cwd', () => root);
    await assert.rejects(runBuild(), /presets.entry.js/);
    await assert.rejects(readFile(resolve(root, '.meu/config.json')), { code: 'ENOENT' });
    const config = await configure(root, 'custom presets');
    await assert.rejects(runBuild(), /custom presets/);
    assert.equal(await readFile(resolve(root, '.meu/config.json'), 'utf8'), config);
    for (const source of ['{', '[]', '{"presets":null}', '{"presets":{"directory":""}}']) {
      await writeFile(resolve(root, '.meu/config.json'), source);
      await assert.rejects(runBuild());
      await assert.rejects(loadPresetsSource(platform));
      assert.equal(await readFile(resolve(root, '.meu/config.json'), 'utf8'), source);
    }
  });

  test(`${platform}: connect skips missing artifacts and loads only its platform`, async t => {
    const root = await project(t);
    t.mock.method(process, 'cwd', () => root);
    assert.equal(await loadPresetsSource(platform), null);
    await configure(root, 'custom presets');
    assert.equal(await loadPresetsSource(platform), null);
    const directory = resolve(root, 'custom presets', platform);
    await mkdir(directory, { recursive: true });
    assert.equal(await loadPresetsSource(platform), null);
    const output = resolve(directory, 'presets.dist.js');
    await writeFile(output, `export const platform = '${platform}';`);
    assert.match(await loadPresetsSource(platform), new RegExp(platform));
    assert.equal(await loadPresetsSource(platform === 'android' ? 'ios' : 'android'), null);
    await writeFile(output, '');
    await assert.rejects(loadPresetsSource(platform), /empty/);
  });

  // Opt in because the real npm CLI may download the pinned bundler.
  test(`${platform}: standalone script bundles existing JS without changing config or source`, {
    skip: process.env.MEU_TEST_PRESETS_BUILD !== '1',
  }, async t => {
    const root = await project(t);
    const standalone = resolve(root, 'standalone');
    await cp(resolve(`skills/to-${platform}-presets`), standalone, { recursive: true });
    t.mock.method(process, 'cwd', () => root);
    for (const base of ['.meu/presets', 'custom presets']) {
      const config = base === '.meu/presets' ? null : await configure(root, base);
      const directory = resolve(root, base, platform);
      await mkdir(resolve(directory, 'page-state'), { recursive: true });
      const feature = resolve(directory, 'page-state/probe.js');
      const implementation = 'export function inspectPageState(value) { return { title: value }; }';
      await writeFile(feature, implementation);
      const entry = resolve(directory, 'presets.entry.js');
      const exports = 'export * from "./page-state/probe.js";';
      await writeFile(entry, exports);
      // No .d.ts is required to bundle JavaScript.
      const { stdout } = await promisify(execFile)(process.execPath, [
        resolve(standalone, 'scripts/build-presets.mjs'),
      ], { cwd: root });
      const result = JSON.parse(stdout);
      assert.equal(result.platform, platform);
      assert.equal(await realpath(result.output), await realpath(resolve(directory, 'presets.dist.js')));
      assert.deepEqual(result.exports, ['inspectPageState']);
      const source = await readFile(result.output, 'utf8');
      const module = new vm.SourceTextModule(source);
      await module.link(() => { throw new Error('Unexpected external import'); });
      await module.evaluate();
      assert.deepEqual(module.namespace.inspectPageState('Settings'), { title: 'Settings' });
      assert.equal(await readFile(entry, 'utf8'), exports);
      assert.equal(await readFile(feature, 'utf8'), implementation);
      await assert.rejects(readFile(resolve(directory, 'presets.d.ts')), { code: 'ENOENT' });
      if (config === null) {
        await assert.rejects(readFile(resolve(root, '.meu/config.json')), { code: 'ENOENT' });
      } else {
        assert.equal(await readFile(resolve(root, '.meu/config.json'), 'utf8'), config);
      }
      await writeFile(feature, 'export const broken = ;');
      await assert.rejects(runBuild());
      assert.equal(await readFile(result.output, 'utf8'), source);
    }
  });
}
