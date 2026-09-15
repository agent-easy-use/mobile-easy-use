import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

for (const platform of ['android', 'ios']) {
  const directory = new URL(`../fixtures/${platform}/ApiDemo/tests/`, import.meta.url);
  async function load({ available = true, ready = true } = {}) {
    let waits = 0;
    const sdk = { wait: { ui: async () => {
      waits += 1;
      return { ok: ready };
    } } };
    const context = vm.createContext({
      AndroidExp: sdk, IOS: sdk,
      R: { id: { api_menu_input: 1 } },
      runtimeStatus: () => ({ platform, available,
        appId: `com.agenteasyuse.mobileeasyuse.apidemo${platform === 'ios' ? '.ios' : ''}` }),
    });
    async function loadSdk(url) {
      const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
      await module.link(specifier => loadSdk(new URL(specifier, url)));
      return module;
    }
    const testModule = await loadSdk(new URL('../sdk/common/test/index.js', import.meta.url));
    await testModule.evaluate();
    const collections = [];
    context.Test = { create() {
      const collection = testModule.namespace.create();
      collections.push(collection);
      return collection;
    } };
    const presets = new vm.SyntheticModule(['inspectPageState'], function () {
      this.setExport('inspectPageState', async () => ({ homeVisible: true, homeAttached: true }));
    }, { context });
    await presets.link(() => {});
    await presets.evaluate();
    const modules = new Map();
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.js')).sort()) {
      const module = new vm.SourceTextModule(await readFile(new URL(name, directory), 'utf8'), { context });
      await module.link(specifier => {
        assert.equal(specifier, '/meu/presets.js', 'only runtime-resolvable imports');
        return presets;
      });
      await module.evaluate();
      modules.set(name, { api: module.namespace, collection: collections.at(-1) });
    }
    return { modules, collections, waits: () => waits };
  }

  test(`${platform}: modules register isolated collections without native actions`, async () => {
    const { modules, collections, waits } = await load();
    assert.equal(waits(), 0);
    assert.equal(collections.length, modules.size);
    assert.equal(new Set(collections).size, modules.size);
    for (const [name, { api, collection }] of modules) {
      assert.deepEqual(Object.keys(api), ['run'], name);
      assert.equal(api.run, collection.run, 'direct runner export');
      const entries = collection.list();
      assert.ok(entries.length > 0, name);
      assert.equal(new Set(entries.map(entry => `${entry.describe}/${entry.test}`)).size, entries.length);
    }
    const runtime = modules.get('runtime.js');
    for (let index = 0; index < 2; index += 1) {
      const report = await runtime.api.run();
      assert.equal(report.ok, true);
      assert.equal(report.total, 1, 'other files must not leak into this run');
      assert.equal(report.passed, 1);
    }
    assert.equal(waits(), 4, 'setup and cleanup run on every invocation');
  });

  test(`${platform}: App identity mismatch fails with assertion details and cleanup`, async () => {
    const { modules, waits } = await load({ available: false });
    const report = await modules.get('runtime.js').api.run();
    assert.equal(report.ok, false);
    assert.equal(report.failed, 1);
    assert.equal(report.tests[0].errors[0].phase, 'test');
    assert.equal(report.tests[0].errors[0].matcher, 'toEqual');
    assert.equal(waits(), 2);
  });

  test(`${platform}: partial setup preserves cleanup errors and stops later cases`, async () => {
    const { modules, waits } = await load({ ready: false });
    const report = await modules.get('input-click.js').api.run();
    assert.equal(report.ok, false);
    assert.equal(report.failed, 1);
    assert.equal(report.notRun, report.total - 1);
    assert.ok(report.notRun > 0);
    assert.deepEqual(Array.from(report.tests[0].errors, error => error.phase), ['beforeEach', 'afterEach']);
    assert.equal(waits(), 2);
  });

  test(`${platform}: invalid selection rejects before touching the App`, async () => {
    const { modules, waits } = await load();
    const { api } = modules.get('runtime.js');
    await assert.rejects(api.run({ describe: 'missing' }), /No tests matched/);
    await assert.rejects(api.run({ test: 'runtime identity' }), /requires describe/);
    assert.equal(waits(), 0);
  });
}
