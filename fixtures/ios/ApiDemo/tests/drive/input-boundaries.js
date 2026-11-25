import ObjC from 'frida-objc-bridge';
import { openScene, returnHome } from './helpers/input-scene.js';
// Synchronous native lookup for scene setup/readback inside main-thread callbacks.
import { findUiView } from '../../../../../sdk/ios/element/query.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const snapshot = () => common.runOnMainThread(() => JSON.parse(String(ObjC.classes.APIController.snapshotJSON())));
function center(identifier) {
  return common.runOnMainThread(() => {
    const view = findUiView(identifier);
    const [[x, y], [width, height]] = view.bounds();
    const [screenX, screenY] = view.convertPoint_toCoordinateSpace_(
      [x + width / 2, y + height / 2], view.window().screen().coordinateSpace());
    return { x: screenX, y: screenY };
  });
}
describe('drive native input boundaries', () => {
  afterEach(returnHome);
  test('Unicode input appends and switching fields preserves text and exclusive focus', async () => {
    await openScene('focus_switch', 'api.input.text');
    for (const step of [
      { target: 'api.input.text', text: 'A-', a: 'A-', b: '', focusA: true },
      { target: 'api.input.text-second', text: 'B-中文🙂', a: 'A-', b: 'B-中文🙂', focusA: false },
      { target: 'api.input.text', text: '回A🙂', a: 'A-回A🙂', b: 'B-中文🙂', focusA: true },
    ]) {
      const result = await drive.input(step.target, step.text);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      const { fixtures } = await snapshot();
      expect(fixtures.text.text).toBe(step.a);
      expect(fixtures.textSecond.text).toBe(step.b);
      expect(fixtures.text.isFirstResponder).toBe(step.focusA);
      expect(fixtures.textSecond.isFirstResponder).toBe(!step.focusA);
    }
  });
  test('a custom UIView receives touches instead of accessibility activation', async () => {
    await openScene('click', 'api.input.activation');
    const result = await drive.click('api.input.activation');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const state = await snapshot();
    expect(state.activationCount).toBe(1);
    expect(state.fixtures.activation.touchCount).toBe(1);
    expect(state.fixtures.activation.accessibilityActivationCount).toBe(0);
  });
  for (const coordinates of [false, true]) {
    test(`clipped target uses ${coordinates ? 'the raw center outside the clip' : 'its visible region'}`, async () => {
      await openScene('geometry', 'api.input.clipped');
      const target = coordinates ? await center('api.input.clipped') : 'api.input.clipped';
      const result = await drive.click(target);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect((await snapshot()).counter).toBe(coordinates ? 0 : 1);
    });
    test(`covered target ${coordinates ? 'coordinates touch the covering view' : 'rejects input without touching either view'}`, async () => {
      await openScene('geometry', 'api.input.covered');
      const target = coordinates ? await center('api.input.covered') : 'api.input.covered';
      const result = await drive.click(target);
      expect(result.ok, JSON.stringify(result)).toBe(coordinates);
      const state = await snapshot();
      expect(state.counter).toBe(0);
      expect(state.fixtures.cover.touchCount).toBe(coordinates ? 1 : 0);
    });
  }
  test('duplicate identifiers click only the first native match', async () => {
    await openScene('geometry', 'api.input.duplicate');
    const result = await drive.click('api.input.duplicate');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const state = await snapshot();
    expect(state.counter).toBe(1);
    expect(state.fixtures.duplicate0.value).toBe('count:1');
    expect(state.fixtures.duplicate1.value).toBe('count:0');
  });
});
