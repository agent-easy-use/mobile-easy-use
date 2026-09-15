import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createExpect } from '../sdk/common/test/expect.js';

class Rect {
  constructor(left = 0, top = 0, right = 0, bottom = 0) {
    Object.assign(this, { left, top, right, bottom });
  }
  offset(horizontal, vertical) {
    this.left += horizontal;
    this.right += horizontal;
    this.top += vertical;
    this.bottom += vertical;
  }
  intersect(other) {
    return Math.max(this.left, other.left) < Math.min(this.right, other.right)
      && Math.max(this.top, other.top) < Math.min(this.bottom, other.bottom);
  }
}

function androidView(parent = null) {
  return {
    attached: true, shown: true, alpha: 1, windowVisibility: 0,
    focused: false, enabled: true, parent, globalVisible: true,
    rect: new Rect(10, 20, 50, 60), frame: new Rect(0, 0, 100, 100), rootOffset: [0, 0],
    isAttachedToWindow() { return this.attached; },
    isShown() { return this.shown; },
    getWindowVisibility() { return this.windowVisibility; },
    getAlpha() { return this.alpha; },
    getParent() { return this.parent; },
    isFocused() { return this.focused; },
    isEnabled() { return this.enabled; },
    getGlobalVisibleRect(rect) { Object.assign(rect, this.rect); return this.globalVisible; },
    getRootView() { return { getLocationOnScreen: location => location.splice(0, 2, ...this.rootOffset) }; },
    getWindowVisibleDisplayFrame(rect) { Object.assign(rect, this.frame); },
  };
}

function iosView(parent = null) {
  return {
    parent, owner: null, hidden: false, opacity: 1, clips: false, focused: false,
    enabled: true, control: true, size: [[0, 0], [40, 40]], screenRect: [[10, 20], [40, 40]],
    window() { return this.owner; },
    superview() { return this.parent; },
    isHidden() { return this.hidden; },
    alpha() { return this.opacity; },
    clipsToBounds() { return this.clips; },
    bounds() { return this.size; },
    convertRect_toView_() { return this.screenRect; },
    isFirstResponder() { return this.focused; },
    isEnabled() { return this.enabled; },
    isKindOfClass_() { return this.control; },
  };
}

async function loadState(platform) {
  let onMain = false;
  const schedule = work => {
    onMain = true;
    try { work(); } finally { onMain = false; }
  };
  const parent = platform === 'android' ? androidView() : iosView();
  const view = platform === 'android' ? androidView(parent) : iosView(parent);
  const window = iosView();
  window.size = [[0, 0], [100, 100]];
  window.screenRect = window.size;
  window.convertRect_toWindow_ = rect => rect;
  window.screen = () => ({ bounds: () => [[0, 0], [100, 100]] });
  if (platform === 'ios') {
    parent.owner = view.owner = window;
    parent.parent = window;
  }
  const bridge = platform === 'android' ? {
    available: true,
    scheduleOnMainThread: schedule,
    use(name) {
      if (name === 'android.view.View') return { class: { isInstance: value => 'getAlpha' in value } };
      assert.equal(name, 'android.graphics.Rect');
      return { $new: () => new Rect() };
    },
    cast: value => value,
    array: (_type, values) => values,
  } : { available: true, mainQueue: {}, classes: { UIControl: {} }, schedule: (_queue, work) => schedule(work) };
  const fixture = { view, parent, window, lookups: [], lookup: () => view };
  const context = vm.createContext({ NULL: null, setTimeout, clearTimeout });
  const root = new URL(`../sdk/${platform}/`, import.meta.url);
  const statePath = platform === 'android' ? 'exp/ui-state.js' : 'ui/state.js';
  const waitPath = platform === 'android' ? 'exp/wait.js' : 'wait.js';
  const lookupPath = platform === 'android' ? 'exp/ui.js' : 'ui/index.js';
  const reportingPath = platform === 'android' ? 'common/index.js' : 'common/reporting.js';
  const stubs = new Map([
    [`frida-${platform === 'android' ? 'java' : 'objc'}-bridge`, { default: bridge }],
    [new URL(lookupPath, root).href, { findUiView(target) {
      assert.equal(onMain, true);
      fixture.lookups.push(target);
      return fixture.lookup(target);
    } }],
    [new URL(reportingPath, root).href, { errorMessage: error => String(error.message ?? error) }],
  ]);
  const modules = new Map();
  async function getModule(identifier) {
    if (!modules.has(identifier)) {
      modules.set(identifier, (async () => {
        const exports = stubs.get(identifier);
        if (exports) return new vm.SyntheticModule(Object.keys(exports), function initialize() {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        }, { context, identifier });
        return new vm.SourceTextModule(await readFile(new URL(identifier), 'utf8'), { context, identifier });
      })());
    }
    return modules.get(identifier);
  }
  const entry = new vm.SourceTextModule(`
    export * from '${new URL(statePath, root).href}';
    export * from '${new URL(waitPath, root).href}';
    export { runOnMainThread } from '${new URL('common/main-thread.js', root).href}';
  `, { context });
  await entry.link((specifier, referencing) => getModule(stubs.has(specifier)
    ? specifier : new URL(specifier, referencing.identifier).href));
  await entry.evaluate();
  return Object.assign(fixture, entry.namespace);
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: checkUiState resolves once on main and matches five state assertions`, async () => {
    const fixture = await loadState(platform);
    const states = ['exists', 'visible', 'hidden', 'focused', 'enabled'];
    assert.deepEqual(Array.from(fixture.UI_STATES), states);
    const expected = [true, true, false, false, true];
    for (const [index, state] of states.entries()) {
      assert.equal(await fixture.checkUiState('target', state), expected[index]);
    }
    assert.deepEqual(fixture.lookups, Array(5).fill('target'));
    const expect = createExpect(() => fixture.lookup(), fixture.runOnMainThread, fixture.checkUiStateNow);
    await expect('target').toExist();
    await expect('target').toBeVisible();
    await expect('target').not.toBeHidden();
    await expect('target').not.toBeFocused();
    await expect('target').toBeEnabled();
    fixture.view.focused = true;
    fixture.view.enabled = false;
    await expect('target').toBeFocused();
    await expect('target').not.toBeEnabled();
    fixture.lookup = () => null;
    for (const state of states) assert.equal(await fixture.checkUiState('missing', state), false);
    for (const matcher of ['toExist', 'toBeVisible', 'toBeHidden', 'toBeFocused', 'toBeEnabled']) {
      await assert.rejects(expect('missing')[matcher](), { name: 'AssertionError' });
      await expect('missing').not[matcher]();
    }
    const count = fixture.lookups.length;
    for (const state of ['exist', 'gone', 'unknown']) {
      await assert.rejects(fixture.checkUiState('target', state), /Unknown UI state/);
    }
    assert.equal(fixture.lookups.length, count);
    fixture.lookup = () => { throw new Error('lookup failed'); };
    await assert.rejects(fixture.checkUiState('target', 'exists'), /lookup failed/);
  });

  test(`${platform}: checks only the requested native getter`, async () => {
    const fixture = await loadState(platform);
    fixture.lookup = () => ({});
    assert.equal(await fixture.checkUiState('target', 'exists'), true);
    fixture.lookup = () => platform === 'android'
      ? { isFocused: () => true } : { isFirstResponder: () => true };
    assert.equal(await fixture.checkUiState('target', 'focused'), true);
    fixture.lookup = () => ({ isKindOfClass_: () => true, isEnabled: () => false });
    assert.equal(await fixture.checkUiState('target', 'enabled'), false);
    fixture.lookup = () => ({ isKindOfClass_: () => true, isEnabled() { throw new Error('getter failed'); } });
    await assert.rejects(fixture.checkUiState('target', 'enabled'), /getter failed/);
    if (platform === 'ios') {
      fixture.lookup = () => ({ isKindOfClass_: () => false });
      await assert.rejects(fixture.checkUiState('target', 'enabled'), /requires a UIControl/);
    }
  });

  test(`${platform}: wait.ui re-resolves targets and uses the same state semantics`, async () => {
    const fixture = await loadState(platform);
    const options = { timeoutMs: 100, intervalMs: 1 };
    fixture.lookup = () => fixture.lookups.length < 3 ? null : fixture.view;
    assert.equal((await fixture.waitForUi('target', 'exists', options)).ok, true);
    assert.equal(fixture.lookups.length, 3);
    fixture.view.shown = false;
    fixture.view.hidden = true;
    assert.equal((await fixture.waitForUi('target', 'hidden', options)).ok, true);
    fixture.view.focused = true;
    assert.equal((await fixture.waitForUi('target', 'focused', options)).ok, true);
    assert.equal((await fixture.waitForUi('target', 'enabled', options)).ok, true);
    fixture.view.shown = true;
    fixture.view.hidden = false;
    assert.equal((await fixture.waitForUi('target', 'visible', options)).ok, true);
    fixture.lookup = () => null;
    const missing = await fixture.waitForUi('missing', 'hidden', { timeoutMs: 5, intervalMs: 1 });
    assert.equal(missing.error.code, 'TIMEOUT');
    for (const state of ['exist', 'gone', 'unknown']) {
      assert.equal((await fixture.waitForUi('target', state, options)).error.code, 'INVALID_ARGUMENT');
    }
    fixture.lookup = () => { throw new Error('invalid target'); };
    const invalid = await fixture.waitForUi({}, 'exists', { timeoutMs: 5, intervalMs: 1 });
    assert.equal(invalid.error.code, 'TIMEOUT');
    assert.equal(invalid.error.lastCheckError, 'invalid target');
  });

  test(`${platform}: wait.until awaits predicates serially and reports invalid results and errors`, async () => {
    const { waitUntil } = await loadState(platform);
    let active = 0;
    let checks = 0;
    const result = await waitUntil(async () => {
      active += 1;
      assert.equal(active, 1);
      await new Promise(resolve => setTimeout(resolve, 1));
      active -= 1;
      checks += 1;
      if (checks === 1) throw new Error('retry');
      return checks === 3;
    }, { timeoutMs: 100, intervalMs: 1 });
    assert.equal(result.ok, true);
    assert.equal(checks, 3);
    for (const predicate of [null, () => 'true', async () => undefined]) {
      assert.equal((await waitUntil(predicate)).error.code, 'INVALID_ARGUMENT');
    }
    for (const options of [{ timeoutMs: 0 }, { intervalMs: -1 }, { timeoutMs: NaN }, { intervalMs: Infinity }]) {
      assert.equal((await waitUntil(() => true, options)).error.code, 'INVALID_ARGUMENT');
    }
    const failure = await waitUntil(async () => { throw new Error('unavailable'); }, { timeoutMs: 5, intervalMs: 1 });
    assert.equal(failure.error.code, 'TIMEOUT');
    assert.equal(failure.error.lastCheckError, 'unavailable');
  });
}

test('android: geometric visibility checks attachment, window, alpha and clipped screen bounds', async () => {
  const fixture = await loadState('android');
  for (const [property, value] of [['attached', false], ['shown', false], ['windowVisibility', 4],
    ['windowVisibility', 8], ['alpha', 0.01], ['globalVisible', false], ['rect', new Rect(100, 0, 120, 20)]]) {
    const original = fixture.view[property];
    fixture.view[property] = value;
    assert.equal(await fixture.checkUiState('target', 'visible'), false, property);
    assert.equal(await fixture.checkUiState('target', 'hidden'), true, property);
    fixture.view[property] = original;
  }
  fixture.parent.alpha = 0.02;
  fixture.view.alpha = 0.5;
  assert.equal(await fixture.checkUiState('target', 'visible'), false);
  fixture.parent.alpha = 1;
  fixture.view.rect = new Rect(-100, -100, -60, -60);
  fixture.view.rootOffset = [110, 120];
  assert.equal(await fixture.checkUiState('target', 'visible'), true);
  fixture.view.frame = new Rect(60, 60, 100, 100);
  assert.equal(await fixture.checkUiState('target', 'visible'), false);
});

test('ios: geometric visibility clips ancestors, window and screen and rejects hidden or detached views', async () => {
  const fixture = await loadState('ios');
  for (const [target, property, value] of [
    [fixture.view, 'owner', null], [fixture.view, 'hidden', true], [fixture.parent, 'hidden', true],
    [fixture.window, 'hidden', true], [fixture.view, 'opacity', 0.01],
    [fixture.view, 'size', [[0, 0], [0, 40]]], [fixture.view, 'screenRect', [[100, 0], [40, 40]]],
    [fixture.window, 'screenRect', [[70, 70], [20, 20]]],
  ]) {
    const original = target[property];
    target[property] = value;
    assert.equal(await fixture.checkUiState('target', 'visible'), false, property);
    assert.equal(await fixture.checkUiState('target', 'hidden'), true, property);
    target[property] = original;
  }
  fixture.parent.opacity = 0.02;
  fixture.view.opacity = 0.5;
  assert.equal(await fixture.checkUiState('target', 'visible'), false);
  fixture.parent.opacity = fixture.view.opacity = 1;
  fixture.parent.clips = true;
  fixture.parent.screenRect = [[30, 30], [40, 40]];
  assert.equal(await fixture.checkUiState('target', 'visible'), true);
  fixture.parent.screenRect = [[80, 80], [10, 10]];
  assert.equal(await fixture.checkUiState('target', 'visible'), false);
  fixture.parent.clips = false;
  assert.equal(await fixture.checkUiState('target', 'visible'), true);
});

test('ios: zero-size clipping ancestors fail before transformed bounds can appear nonempty', async () => {
  const fixture = await loadState('ios');
  fixture.parent.clips = true;
  fixture.parent.convertRect_toView_ = () => assert.fail('empty clip must not be converted');
  for (const size of [[[0, 0], [0, 40]], [[0, 0], [40, 0]]]) {
    fixture.parent.size = size;
    assert.equal(await fixture.checkUiState('target', 'visible'), false);
  }
  fixture.parent.clips = false;
  assert.equal(await fixture.checkUiState('target', 'visible'), true);
});
