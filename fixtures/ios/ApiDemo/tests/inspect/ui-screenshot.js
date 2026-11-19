import { ui } from '../../../../../sdk/ios/inspect/ui/index.js';
import { requestController } from '../../../../../sdk/common/controller.js';
const { describe, test, expect, run } = Test.create();
export { run };

// Use the existing home-page control: no fixture overlay or changes to the UI.
describe('inspect.ui existing page screenshot', () => {
  test('highlights the existing ApiDemo Input control in its original position', async () => {
    const target = 'api.menu.input';
    expect(await ui.isVisible(target)).toBe(true);
    const before = await ui.layoutInWindow(target);
    const original = await ui.screenshotWindow();
    const marked = await ui.screenshotElementInWindow(target);
    const unmarked = await ui.screenshotElementInWindow(target, false);
    expect(unmarked.highlight).toBe(null);
    expect(unmarked.sourceBounds).toEqual(marked.sourceBounds);
    expect(unmarked.region).toEqual(marked.region);
    const unchanged = await requestController('screenshot.compare', { actualPath: unmarked.filePath, baselinePath: original.filePath, options: { maxDiffPixelRatio: 0 } });
    expect(unchanged.ok).toBe(true);
    expect(unchanged.responsePayload.matches).toBe(true);
    expect(marked.width).toBe(original.width);
    expect(marked.height).toBe(original.height);
    expect(original.highlight).toBe(null);
    const sx = marked.width / marked.sourceBounds.width;
    const sy = marked.height / marked.sourceBounds.height;
    expect(marked.highlight.x).toBe(Math.floor((before.targetBounds.x - marked.sourceBounds.x) * sx));
    expect(marked.highlight.y).toBe(Math.floor((before.targetBounds.y - marked.sourceBounds.y) * sy));
    expect((await ui.layoutInWindow(target)).targetBounds).toEqual(before.targetBounds);
    const comparison = await requestController('screenshot.compare', { actualPath: marked.filePath,
      baselinePath: original.filePath, options: { maxDiffPixelRatio: 0 } });
    expect(comparison.ok).toBe(true);
    expect(comparison.responsePayload.diffPixelRatio).toBeGreaterThan(0);
    console.log(JSON.stringify({ original: original.filePath, highlighted: marked.filePath, targetBounds: before.targetBounds, highlight: marked.highlight }));
  });
});
