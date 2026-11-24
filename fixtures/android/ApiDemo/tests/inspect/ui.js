import Java from 'frida-java-bridge';
import { drive } from '../../../../../sdk/android/drive/index.js';
import { ui } from '../../../../../sdk/android/inspect/ui/index.js';
import { runOnMainThread } from '../../../../../sdk/android/common/main-thread.js';
import { requestController } from '../../../../../sdk/common/controller.js';
import { createScene, removeScene, disposeTree } from './helpers/ui-scene.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
let scene;
const buttonPath = ['tag::inspect.ui.panel', 'tag::inspect.ui.button'];

describe('inspect.ui', () => {
  beforeEach(async () => { scene = await createScene(); });
  afterEach(async () => { await removeScene(scene); scene = null; });

  test('state predicates read real Views and missing targets', async () => {
    expect(await ui.isExisting(buttonPath)).toBe(true);
    const resourceId = await runOnMainThread(() => Number(scene.button.getId()));
    expect(await ui.isExisting(resourceId)).toBe(true);
    expect(await ui.isVisible(scene.button)).toBe(true);
    expect(await ui.isHidden(scene.button)).toBe(false);
    expect(await ui.isEnabled(scene.button)).toBe(true);
    await runOnMainThread(() => { scene.button.setEnabled(false); scene.button.setVisibility(4); });
    expect(await ui.isEnabled(buttonPath)).toBe(false);
    expect(await ui.isVisible(buttonPath)).toBe(false);
    expect(await ui.isHidden(buttonPath)).toBe(true);
    await runOnMainThread(() => scene.field.requestFocus());
    expect(await ui.isFocused(scene.field)).toBe(true);
    for (const name of ['isExisting', 'isVisible', 'isHidden', 'isFocused', 'isEnabled']) {
      expect(await ui[name](['tag::inspect.ui.missing']), name).toBe(false);
    }
  });

  test('wait accepts native Views and observes changes on the same object', async () => {
    expect((await drive.wait(scene.button, 'exists')).ok).toBe(true);
    expect((await drive.wait(scene.button, 'visible')).ok).toBe(true);
    await runOnMainThread(() => scene.button.setEnabled(false));
    let update;
    const timer = setTimeout(() => {
      update = runOnMainThread(() => scene.button.setEnabled(true));
    }, 100);
    try {
      const ready = await drive.wait(scene.button, 'enabled', { timeoutMs: 2000, intervalMs: 20 });
      expect(ready.ok).toBe(true);
    } finally {
      clearTimeout(timer);
      if (update) await update;
    }
    await runOnMainThread(() => scene.button.setVisibility(4));
    expect((await drive.wait(scene.button, 'hidden')).ok).toBe(true);
    const invisible = await drive.wait(scene.button, 'visible', { timeoutMs: 100, intervalMs: 20 });
    expect(invisible.ok).toBe(false);
    expect(invisible.error.code).toBe('TIMEOUT');
    await runOnMainThread(() => scene.field.requestFocus());
    expect((await drive.wait(scene.field, 'focused')).ok).toBe(true);
  });

  test('tree preserves native identity and depth and nodes feed other APIs', async () => {
    const root = await ui.tree(['tag::inspect.ui.panel'], 1);
    try {
      expect(Object.keys(root).sort()).toEqual(['bounds', 'children', 'className', 'target']);
      expect(root.className).toBe('android.widget.FrameLayout');
      expect(root.bounds).toEqual({ x: 0, y: 0, width: 320, height: 400 });
      expect(root.children[0].bounds).toEqual({ x: 0, y: 0, width: 240, height: 160 });
      expect(root.children.length).toBe(2);
      expect(root.children[0].children.length).toBe(0);
      expect(await runOnMainThread(() => root.children[0].target.equals(scene.parent))).toBe(true);
      const subtree = await ui.tree(root.children[0].target, 1);
      try {
        expect(subtree.children.length).toBe(1);
        expect(subtree.children[0].className).toBe('android.widget.Button');
        expect(subtree.children[0].bounds).toEqual({ x: 0, y: 0, width: 80, height: 40 });
        expect(await ui.isEnabled(subtree.children[0].target)).toBe(true);
        expect((await ui.layout(subtree.children[0].target)).bounds.width).toBe(80);
      } finally { disposeTree(subtree); }
    } finally { disposeTree(root); }
    let rejected = false;
    try { await ui.tree(scene.panel, -1); } catch (_) { rejected = true; }
    expect(rejected).toBe(true);
  });

  test('layout uses px and converts parent, window and screen positions', async () => {
    const own = await ui.layout(scene.button);
    expect(own.bounds).toEqual({ x: 0, y: 0, width: 80, height: 40 });
    expect(own.unit).toBe('px');
    const density = await runOnMainThread(() => Number(scene.button.getResources().getDisplayMetrics().density.value));
    expect(own.density).toBe(density);
    const parent = await ui.layoutInParent(scene.button);
    expect(parent.bounds).toEqual({ x: 0, y: 0, width: 240, height: 160 });
    expect(parent.targetBounds).toEqual({ x: 12, y: 16, width: 80, height: 40 });
    const window = await ui.layoutInWindow(scene.button);
    const screen = await ui.layoutInScreen(scene.button);
    const locations = await runOnMainThread(() => {
      const w = Java.array('int', [0, 0]), s = Java.array('int', [0, 0]);
      scene.button.getLocationInWindow(w); scene.button.getLocationOnScreen(s);
      return { window: Array.from(w), screen: Array.from(s) };
    });
    expect([window.targetBounds.x, window.targetBounds.y]).toEqual(locations.window);
    expect([screen.targetBounds.x, screen.targetBounds.y]).toEqual(locations.screen);
    expect(screen.bounds.width).toBeGreaterThanOrEqual(window.bounds.width);
    expect(screen.bounds.height).toBeGreaterThanOrEqual(window.bounds.height);
  });

  test('layout maps scaling, rotation and scrolled parents', async () => {
    await runOnMainThread(() => { scene.button.setPivotX(0); scene.button.setPivotY(0); scene.button.setScaleX(2); scene.parent.scrollTo(5, 7); });
    const scaled = await ui.layoutInParent(scene.button);
    expect(scaled.targetBounds).toEqual({ x: 7, y: 9, width: 160, height: 40 });
    await runOnMainThread(() => { scene.button.setScaleX(1); scene.button.setRotation(90); });
    const rotated = await ui.layoutInParent(scene.button);
    expect(Math.abs(rotated.targetBounds.width - 40)).toBeLessThan(0.01);
    expect(Math.abs(rotated.targetBounds.height - 80)).toBeLessThan(0.01);
    expect((await ui.layout(scene.button)).bounds.width).toBe(80);
  });

  test('element screenshot returns a local image and supports visual assertions', async () => {
    const element = await ui.screenshotElement(scene.button);
    const window = await ui.screenshotElementInWindow(scene.button, false);
    expect(element.highlight, 'Element image has no annotation').toBe(null);
    expect(element.width, 'Element image has positive width').toBeGreaterThan(0);
    expect(element.height, 'Element image has positive height').toBeGreaterThan(0);
    expect(element.width < window.width, 'Element image is narrower than the window').toBe(true);
    expect(element.height < window.height, 'Element image is shorter than the window').toBe(true);
    expect(element.sourceBounds.width, 'Crop width matches native bounds').toBe(element.width);
    expect(element.sourceBounds.height, 'Crop height matches native bounds').toBe(element.height);
    await expect(scene.button).toMatchElementScreenshot(element.filePath, { maxDiffPixelRatio: 0 });
    await expect(scene.button).not.toMatchElementScreenshot(window.filePath);
    const currentWindow = await ui.screenshotWindow();
    await expect().toMatchWindowScreenshot(currentWindow.filePath, { maxDiffPixelRatio: 0 });
  });

  test('element screenshot rejects missing and hidden targets', async () => {
    let missing = false;
    try { await ui.screenshotElement(['tag::inspect.ui.missing']); } catch (_) { missing = true; }
    expect(missing, 'Missing element cannot be captured').toBe(true);
    await runOnMainThread(() => scene.button.setVisibility(4));
    let hidden = false;
    try { await ui.screenshotElement(scene.button); } catch (_) { hidden = true; }
    expect(hidden, 'Hidden element cannot be captured').toBe(true);
  });

  test('screenshot saves a window image and highlights the tree target without altering App', async () => {
    const root = await ui.tree(scene.parent, 1);
    try {
      const before = await ui.layoutInWindow(scene.button);
      const original = await ui.screenshotWindow();
      const marked = await ui.screenshotElementInWindow(root.children[0].target);
      expect(original.highlight).toBe(null);
      expect(marked.format).toBe('png');
      expect(marked.width).toBe(original.width);
      expect(marked.height).toBe(original.height);
      expect(marked.highlight.width).toBe(80);
      expect(marked.highlight.height).toBe(40);
      expect(marked.highlight.x).toBe(before.targetBounds.x - marked.sourceBounds.x);
      expect(marked.highlight.y).toBe(before.targetBounds.y - marked.sourceBounds.y);
      const compared = await requestController('screenshot.compare', { actualPath: marked.filePath, baselinePath: original.filePath, options: { maxDiffPixelRatio: 0 } });
      expect(compared.ok).toBe(true);
      expect(compared.responsePayload.matches).toBe(false);
      expect(compared.responsePayload.diffPixelRatio).toBeGreaterThan(0);
      expect((await ui.layoutInWindow(scene.button)).targetBounds).toEqual(before.targetBounds);
    } finally { disposeTree(root); }
  });

  test('screenshot clips highlight at the window edge and rejects missing targets', async () => {
    await runOnMainThread(() => scene.button.setTranslationX(-60));
    const image = await ui.screenshotElementInWindow(scene.button);
    expect(image.highlight.x).toBe(0);
    expect(image.highlight.width).toBeLessThan(80);
    let rejected = false;
    try { await ui.screenshotElementInWindow(['tag::inspect.ui.missing']); } catch (_) { rejected = true; }
    expect(rejected).toBe(true);
    let invalid = false;
    try { await ui.screenshotElementInWindow(); } catch (_) { invalid = true; }
    expect(invalid).toBe(true);
  });
  test('screenshot uses the native target owning popup window', async () => {
    let popup, content;
    try {
      await runOnMainThread(() => {
        const context = scene.panel.getContext();
        content = Java.retain(Java.use('android.widget.FrameLayout').$new(context));
        content.setBackgroundColor(-1);
        popup = Java.retain(Java.use('android.widget.PopupWindow').$new(content, 200, 150, false));
        popup.showAtLocation(scene.panel, 51, 40, 80); // Gravity.TOP | Gravity.LEFT
      });
      const deadline = Date.now() + 5000;
      while (!(await runOnMainThread(() => content.isAttachedToWindow() && content.getWidth() === 200))) {
        if (Date.now() >= deadline) throw new Error('Popup did not layout');
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      const image = await ui.screenshotElementInWindow(content);
      expect(image.width).toBe(200);
      expect(image.height).toBe(150);
      expect(image.highlight).toEqual({ x: 0, y: 0, width: 200, height: 150 });
      const screen = await ui.layoutInScreen(content);
      expect(image.region).toEqual(screen.targetBounds);
    } finally {
      if (popup) {
        await runOnMainThread(() => popup.dismiss());
        popup.$dispose();
      }
      if (content) content.$dispose();
    }
  });

  test('depth zero returns only root and unavailable layouts reject', async () => {
    const root = await ui.tree(scene.panel, 0);
    try { expect(root.children.length).toBe(0); }
    finally { disposeTree(root); }
    for (const depth of [NaN, Infinity, 1.5, 65]) {
      let rejected = false;
      try { await ui.tree(scene.panel, depth); } catch (_) { rejected = true; }
      expect(rejected, `Invalid depth ${depth}`).toBe(true);
    }
    await runOnMainThread(() => scene.parent.removeView(scene.button));
    for (const name of ['layoutInParent', 'layoutInWindow', 'layoutInScreen', 'screenshotElementInWindow']) {
      let rejected = false;
      try { await ui[name](scene.button); } catch (_) { rejected = true; }
      expect(rejected, name).toBe(true);
    }
  });

  test('visibility accounts for transparent ancestors and detached native Views', async () => {
    expect(await ui.isVisible(scene.button)).toBe(true);
    await runOnMainThread(() => scene.parent.setAlpha(0));
    expect(await ui.isVisible(scene.button)).toBe(false);
    await runOnMainThread(() => scene.parent.setAlpha(1));
    expect(await ui.isVisible(scene.button)).toBe(true);
    await runOnMainThread(() => scene.parent.removeView(scene.button));
    expect(await ui.isVisible(scene.button)).toBe(false);
    expect(await ui.isExisting(scene.button)).toBe(true);
  });

});
