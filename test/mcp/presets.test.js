import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadPresetsSource } from '../../src/sdk-source.js';

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

for (const platform of ['android', 'ios']) {
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

  test(`${platform}: invalid configuration is rejected without modification`, async t => {
    const root = await project(t);
    t.mock.method(process, 'cwd', () => root);
    await configure(root, 'custom presets');
    for (const source of ['{', '[]', '{"presets":null}', '{"presets":{"directory":""}}']) {
      await writeFile(resolve(root, '.meu/config.json'), source);
      await assert.rejects(loadPresetsSource(platform));
      assert.equal(await readFile(resolve(root, '.meu/config.json'), 'utf8'), source);
    }
  });
}
