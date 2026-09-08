import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { collectEvidenceLog } from '../src/mcp-api/evidence.js';

async function fixture(platform) {
  const evidence = new Map();
  const context = vm.createContext({
    console: { log: line => collectEvidenceLog(evidence, line), warn() {} },
  });
  const modules = new Map();
  async function load(url) {
    if (!modules.has(url.href)) {
      modules.set(url.href, new vm.SourceTextModule(await readFile(url, 'utf8'), {
        context, identifier: url.href,
      }));
    }
    return modules.get(url.href);
  }
  const entry = await load(new URL(`../sdk/${platform}/probe/evidence/state.js`, import.meta.url));
  await entry.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
  await entry.evaluate();
  context.observe = entry.namespace.withStateEvidence;
  return {
    run: source => vm.runInContext(source, context),
    state: () => evidence.get('action').state,
  };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: await getters in order and publish before snapshots before action`, async () => {
    const f = await fixture(platform);
    const sequence = await f.run(`(async () => {
      const sequence = [];
      let phase = 'before';
      const shared = { value: 1 };
      const result = await observe(async () => {
        sequence.push('action'); phase = 'after'; shared.value = 2; return 42;
      }, 'action', {
        first: async () => { sequence.push(phase + ':start'); await Promise.resolve(); sequence.push(phase + ':end'); return shared; },
        second: () => { sequence.push(phase + ':second'); return null; },
      });
      if (result !== 42) throw Error('lost action result');
      return sequence;
    })()`);
    assert.deepEqual(Array.from(sequence), ['before:start', 'before:end', 'before:second', 'action', 'after:start', 'after:end', 'after:second']);
    assert.deepEqual(f.state(), {
      first: {path: 'first', before: {value: 1}, after: {value: 2}},
      second: {path: 'second', before: null, after: null},
    });
  });

  for (const reject of [false, true]) {
    test(`${platform}: pending getters gate action and completion (reject=${reject})`, async () => {
      const f = await fixture(platform);
      f.run(`
        var order = [], phase = 'before', release, settled = false;
        var pending = observe(() => { order.push('action'); phase = 'after'; return 42; }, 'action', {
          gated: () => { order.push(phase + ':gated'); return new Promise((resolve, reject) => {
            release = () => ${reject ? "reject(Error('delayed failure'))" : "resolve(phase)"};
          }); },
          next: () => { order.push(phase + ':next'); return 7; },
        }).then(value => { settled = true; return value; });
      `);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(Array.from(f.run('order')), ['before:gated']);
      assert.equal(f.run('settled'), false);
      f.run('release()');
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(Array.from(f.run('order')), ['before:gated', 'before:next', 'action', 'after:gated']);
      assert.equal(f.run('settled'), false);
      f.run('release()');
      assert.equal(await f.run('pending'), 42);
      assert.deepEqual(Array.from(f.run('order')), ['before:gated', 'before:next', 'action', 'after:gated', 'after:next']);
      assert.deepEqual(f.state(), {
        gated: reject
          ? {path: 'gated', errors: {before: 'delayed failure', after: 'delayed failure'}}
          : {path: 'gated', before: 'before', after: 'after'},
        next: {path: 'next', before: 7, after: 7},
      });
    });
  }

  test(`${platform}: getter failures produce checkpoint errors and do not skip later getters`, async () => {
    const f = await fixture(platform);
    await f.run(`observe(() => 7, 'action', {
      rejected: () => Promise.reject(Error('async failed')),
      thrown: () => { throw Error('sync failed'); },
      invalidGetter: 3,
      valid: async () => ({screenshots: 'business field', items: [true, null, 2]}),
    })`);
    assert.deepEqual(Object.keys(f.state()).sort(), ['invalidGetter', 'rejected', 'thrown', 'valid']);
    for (const [key, entry] of Object.entries(f.state())) {
      if (key === 'valid') {
        assert.deepEqual(entry, {path: 'valid',
          before: {screenshots: 'business field', items: [true, null, 2]},
          after: {screenshots: 'business field', items: [true, null, 2]},
        });
      } else {
        const message = {rejected: 'async failed', thrown: 'sync failed', invalidGetter: 'Getter must be a function'}[key];
        assert.deepEqual(entry, {path: key, errors: {before: message, after: message}});
      }
    }
  });

  test(`${platform}: failed before does not skip action, after failures preserve the original action error`, async () => {
    const f = await fixture(platform);
    await f.run(`(async () => {
      let ran = false;
      const failure = Error('business failed');
      try {
        await observe(async () => { ran = true; throw failure; }, 'action', {
          recover: async () => { if (!ran) throw Error('not ready'); return null; },
          failAfter: () => { if (ran) throw Error('gone'); return 1; },
        });
        throw Error('missing rejection');
      } catch (error) { if (error !== failure) throw error; }
    })()`);
    assert.deepEqual(f.state(), {
      recover: {path: 'recover', after: null, errors: {before: 'not ready'}},
      failAfter: {path: 'failAfter', before: 1, errors: {after: 'gone'}},
    });
  });
}

test('state aggregation distinguishes absent/null/error and safely handles special keys', () => {
  const map = new Map();
  const emit = payload => collectEvidenceLog(map, '@@MOBILE_EVIDENCE@@' + JSON.stringify({
    category: 'state', payload: {actionDescription: 'action', path: '__proto__', ...payload},
  }));
  emit({checkpoint: 'before', value: null});
  assert.deepEqual(map.get('action').state.__proto__, {path: '__proto__', before: null});
  emit({checkpoint: 'before', error: 'failed'});
  assert.deepEqual(map.get('action').state.__proto__, {path: '__proto__', errors: {before: 'failed'}});
  emit({checkpoint: 'before', value: 1});
  assert.deepEqual(map.get('action').state.__proto__, {path: '__proto__', before: 1});
  assert.equal(Object.hasOwn(Object.prototype, 'errors'), false);
});
