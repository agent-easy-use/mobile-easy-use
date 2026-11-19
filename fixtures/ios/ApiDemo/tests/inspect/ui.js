import ObjC from 'frida-objc-bridge';
import { drive } from '../../../../../sdk/ios/drive/index.js';
import { inspect } from '../../../../../sdk/ios/inspect/index.js';
const { ui } = inspect;
import { runOnMainThread } from '../../../../../sdk/ios/common/main-thread.js';
import { requestController } from '../../../../../sdk/common/controller.js';
import { createScene, removeScene } from './helpers/ui-scene.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
let scene;
const buttonPath = ['identifier::inspect.ui.panel', 'identifier::inspect.ui.button'];

describe('inspect.ui', () => {
  beforeEach(async () => { scene = await createScene(); });
  afterEach(async () => { await removeScene(scene); scene = null; });

  test('state predicates read UIKit flags, first responder and missing targets', async () => {
    expect(await ui.isExisting(buttonPath)).toBe(true);
    expect(await ui.isVisible(scene.button)).toBe(true);
    expect(await ui.isHidden(scene.button)).toBe(false);
    expect(await ui.isEnabled(scene.button)).toBe(true);
    await runOnMainThread(() => { scene.button.setEnabled_(false); scene.button.setHidden_(true); });
    expect(await ui.isEnabled(buttonPath)).toBe(false);
    expect(await ui.isVisible(buttonPath)).toBe(false);
    expect(await ui.isHidden(buttonPath)).toBe(true);
    await runOnMainThread(() => scene.field.becomeFirstResponder());
    expect(await ui.isFocused(scene.field)).toBe(true);
    for (const name of ['isExisting', 'isVisible', 'isHidden', 'isFocused', 'isEnabled']) {
      expect(await ui[name]('inspect.ui.missing'), name).toBe(false);
    }
  });

  test('wait accepts native UIViews and observes changes on the same object', async () => {
    expect((await drive.wait(scene.button, 'exists')).ok).toBe(true);
    expect((await drive.wait(scene.button, 'visible')).ok).toBe(true);
    await runOnMainThread(() => scene.button.setEnabled_(false));
    let update;
    const timer = setTimeout(() => {
      update = runOnMainThread(() => scene.button.setEnabled_(true));
    }, 100);
    try {
      const ready = await drive.wait(scene.button, 'enabled', { timeoutMs: 2000, intervalMs: 20 });
      expect(ready.ok).toBe(true);
    } finally {
      clearTimeout(timer);
      if (update) await update;
    }
    await runOnMainThread(() => scene.button.setHidden_(true));
    expect((await drive.wait(scene.button, 'hidden')).ok).toBe(true);
    const invisible = await drive.wait(scene.button, 'visible', { timeoutMs: 100, intervalMs: 20 });
    expect(invisible.ok).toBe(false);
    expect(invisible.error.code).toBe('TIMEOUT');
    await runOnMainThread(() => scene.field.becomeFirstResponder());
    expect((await drive.wait(scene.field, 'focused')).ok).toBe(true);
  });

  test('enabled checks own UIView and UIControl flags independently of ancestors', async () => {
    await runOnMainThread(() => scene.parent.setUserInteractionEnabled_(false));
    expect(await ui.isEnabled(scene.parent)).toBe(false);
    expect(await ui.isEnabled(scene.button)).toBe(true);
    await runOnMainThread(() => scene.button.setUserInteractionEnabled_(false));
    expect(await ui.isEnabled(scene.button)).toBe(false);
    await runOnMainThread(() => { scene.button.setUserInteractionEnabled_(true); scene.button.setEnabled_(false); });
    expect(await ui.isEnabled(scene.button)).toBe(false);
  });

  test('tree preserves native identity and depth and nodes feed other APIs', async () => {
    const root = await ui.tree('inspect.ui.panel', 1);
    expect(Object.keys(root).sort()).toEqual(['bounds', 'children', 'className', 'target']);
    expect(root.className).toBe('UIView');
    const scale = await runOnMainThread(() => Number(scene.panel.window().screen().scale()));
    expect(root.bounds).toEqual({ x: 0, y: 0, width: 320 * scale, height: 400 * scale });
    expect(root.children[0].bounds).toEqual({ x: 0, y: 0, width: 240 * scale, height: 160 * scale });
    expect(root.children.length).toBe(2);
    expect(root.children[0].children.length).toBe(0);
    expect(root.children[0].target.handle.equals(scene.parent.handle)).toBe(true);
    const subtree = await ui.tree(root.children[0].target, 1);
    expect(subtree.children.length).toBe(1);
    expect(subtree.children[0].className).toBe('UIButton');
    expect(subtree.children[0].bounds).toEqual({ x: 0, y: 0, width: 80 * scale, height: 40 * scale });
    expect(await ui.isEnabled(subtree.children[0].target)).toBe(true);
    const size = await ui.layout(subtree.children[0].target);
    expect(size.bounds.width / size.scale).toBe(80);
    let rejected = false;
    try { await ui.tree(scene.panel, -1); } catch (_) { rejected = true; }
    expect(rejected).toBe(true);
  });

  test('layout returns px, scale and consistent parent, window and screen coordinates', async () => {
    const own = await ui.layout(scene.button);
    const scale = await runOnMainThread(() => Number(scene.button.window().screen().scale()));
    expect(own.scale).toBe(scale);
    expect(own.unit).toBe('px');
    expect(own.bounds).toEqual({ x: 0, y: 0, width: 80 * scale, height: 40 * scale });
    const parent = await ui.layoutInParent(scene.button);
    expect(parent.bounds).toEqual({ x: 0, y: 0, width: 240 * scale, height: 160 * scale });
    expect(parent.targetBounds).toEqual({ x: 12 * scale, y: 16 * scale, width: 80 * scale, height: 40 * scale });
    const window = await ui.layoutInWindow(scene.button);
    expect(window.targetBounds).toEqual({ x: 32 * scale, y: 56 * scale, width: 80 * scale, height: 40 * scale });
    const screen = await ui.layoutInScreen(scene.button);
    expect(screen.targetBounds).toEqual(window.targetBounds);
    expect(screen.bounds.width).toBeGreaterThanOrEqual(window.bounds.width);
    expect(screen.bounds.height).toBeGreaterThanOrEqual(window.bounds.height);
  });

  test('layout respects nonzero bounds origin and transforms', async () => {
    await runOnMainThread(() => scene.parent.setBounds_([[5, 7], [240, 160]]));
    const parent = await ui.layoutInParent(scene.button);
    const scale = parent.scale;
    expect(parent.bounds.x).toBe(5 * scale);
    const snapshot = await ui.tree(scene.parent, 0);
    expect(snapshot.bounds).toEqual({ x: 5 * scale, y: 7 * scale, width: 240 * scale, height: 160 * scale });
    expect(snapshot.children.length).toBe(0);
    expect(parent.targetBounds.x).toBe(12 * scale);
    const window = await ui.layoutInWindow(scene.button);
    expect(window.targetBounds.x).toBe(27 * scale);
    expect(window.targetBounds.y).toBe(49 * scale);
    await runOnMainThread(() => scene.button.setTransform_([0, 1, -1, 0, 0, 0]));
    const rotated = await ui.layoutInParent(scene.button);
    expect(Math.abs(rotated.targetBounds.width - 40 * scale)).toBeLessThan(0.01);
    expect(Math.abs(rotated.targetBounds.height - 80 * scale)).toBeLessThan(0.01);
    expect((await ui.layout(scene.button)).bounds.width).toBe(80 * scale);
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
    try { await ui.screenshotElement('inspect.ui.missing'); } catch (_) { missing = true; }
    expect(missing, 'Missing element cannot be captured').toBe(true);
    await runOnMainThread(() => scene.button.setHidden_(true));
    let hidden = false;
    try { await ui.screenshotElement(scene.button); } catch (_) { hidden = true; }
    expect(hidden, 'Hidden element cannot be captured').toBe(true);
  });

  test('screenshot saves window original and highlights a native tree target', async () => {
    const root = await ui.tree(scene.parent, 1);
    const before = await ui.layoutInWindow(scene.button);
    const original = await ui.screenshotWindow();
    const marked = await ui.screenshotElementInWindow(root.children[0].target);
    expect(original.highlight).toBe(null);
    expect(marked.format).toBe('png');
    expect(marked.width).toBe(original.width);
    expect(marked.height).toBe(original.height);
    expect(marked.highlight).toEqual(before.targetBounds);
    const compared = await requestController('screenshot.compare', { actualPath: marked.filePath, baselinePath: original.filePath, options: { maxDiffPixelRatio: 0 } });
    expect(compared.ok).toBe(true);
    expect(compared.responsePayload.matches).toBe(false);
    expect(compared.responsePayload.diffPixelRatio).toBeGreaterThan(0);
    expect((await ui.layoutInWindow(scene.button)).targetBounds).toEqual(before.targetBounds);
  });

  test('screenshot uses the target owning window and handles clipped and missing targets', async () => {
    let window, view;
    try {
      await runOnMainThread(() => {
        window = ObjC.classes.UIWindow.alloc().initWithFrame_([[40, 80], [200, 150]]);
        window.setWindowScene_(scene.panel.window().windowScene());
        window.setFrame_([[40, 80], [200, 150]]);
        window.setBackgroundColor_(ObjC.classes.UIColor.whiteColor());
        view = ObjC.classes.UIView.alloc().initWithFrame_([[-10, 20], [60, 40]]);
        window.addSubview_(view);
        window.setHidden_(false);
      });
      const image = await ui.screenshotElementInWindow(view);
      const geometry = await ui.layoutInWindow(view);
      expect(image.width).toBe(200 * geometry.scale);
      expect(image.height).toBe(150 * geometry.scale);
      expect(image.highlight.x).toBe(0);
      expect(image.highlight.width).toBe(50 * geometry.scale);
      const screen = await ui.layoutInScreen(view);
      expect(Math.abs(screen.targetBounds.x - image.region.x - geometry.targetBounds.x)).toBeLessThan(0.01);
    } finally {
      await runOnMainThread(() => {
        if (window) { window.setHidden_(true); window.release(); }
        if (view) view.release();
      });
    }
    let rejected = false;
    try { await ui.screenshotElementInWindow('inspect.ui.missing'); } catch (_) { rejected = true; }
    expect(rejected).toBe(true);
    let invalid = false;
    try { await ui.screenshotElementInWindow(); } catch (_) { invalid = true; }
    expect(invalid).toBe(true);
  });
  test('depth zero returns only root and detached layouts reject', async () => {
    const root = await ui.tree(scene.panel, 0);
    expect(root.children.length).toBe(0);
    for (const depth of [NaN, Infinity, 1.5, 65]) {
      let rejected = false;
      try { await ui.tree(scene.panel, depth); } catch (_) { rejected = true; }
      expect(rejected, `Invalid depth ${depth}`).toBe(true);
    }
    await runOnMainThread(() => scene.button.removeFromSuperview());
    for (const name of ['layout', 'layoutInParent', 'layoutInWindow', 'layoutInScreen', 'screenshotElementInWindow']) {
      let rejected = false;
      try { await ui[name](scene.button); } catch (_) { rejected = true; }
      expect(rejected, name).toBe(true);
    }
  });

});
