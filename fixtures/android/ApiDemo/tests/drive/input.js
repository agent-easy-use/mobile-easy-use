import { openScene, returnHome, readInputText, readLongPressCount, readOffset } from './helpers/input-scene.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
describe('drive input gestures', () => {
  afterEach(returnHome);
  test('text input focuses the field and reaches the native text control', async () => {
    const target = R.id.api_input_text;
    await openScene("text_input", target);
    expect(await readInputText()).toBe('');
    const result = await drive.input(target, 'ApiDemo 123');
    expect(result.ok, result.error?.message ?? 'input succeeds').toBe(true);
    const completed = await drive.waitUntil(async () => (await readInputText()) === 'ApiDemo 123');
    expect(completed.ok, 'Native text updated').toBe(true);
    expect(await readInputText()).toBe('ApiDemo 123');
    expect((await drive.wait(target, 'focused')).ok).toBe(true);
    expect(await inspect.ui.isFocused(target)).toBe(true);
  });
  test('long press invokes the native gesture handler once', async () => {
    const target = R.id.api_input_long_press;
    await openScene('long_press', target);
    const before = await readLongPressCount();
    const result = await drive.longPress(target);
    expect(result.ok, result.error?.message ?? 'long press succeeds').toBe(true);
    const completed = await drive.waitUntil(async () => (await readLongPressCount()) > before);
    expect(completed.ok, 'Native long press completed').toBe(true);
    expect(await readLongPressCount()).toBe(before + 1);
  });
  for (const [scenario, targetName, direction, axis] of [
    ['vertical_scroll', "api_input_vertical_scroll", 'up', 'y'],
    ['horizontal_scroll', "api_input_horizontal_scroll", 'left', 'x'],
  ]) {
    test(`${scenario} moves native content in the requested direction`, async () => {
      const target = R.id[targetName];
      await openScene(scenario, target);
      const before = await readOffset(target, axis);
      const result = await drive.scroll(target, direction);
      expect(result.ok, result.error?.message ?? 'scroll succeeds').toBe(true);
      const moved = await drive.waitUntil(async () => (await readOffset(target, axis)) > before);
      expect(moved.ok, 'Native content moved').toBe(true);
      expect(await readOffset(target, axis)).toBeGreaterThan(before);
    });
  }
});
