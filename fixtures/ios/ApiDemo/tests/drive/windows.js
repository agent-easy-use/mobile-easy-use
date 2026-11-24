import ObjC from 'frida-objc-bridge';
import { openScene, returnHome } from './helpers/input-scene.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const controller = () => ObjC.classes.APIController;
const snapshot = () => common.runOnMainThread(() => JSON.parse(String(controller().inputWindowSnapshotJSON())));
describe('drive window targeting', () => {
  beforeEach(async () => { await openScene('windows', 'api.input.ready.windows'); });
  afterEach(returnHome);
  for (const mode of ['same', 'higher', 'lower', 'hidden', 'passthrough', 'outside', 'top']) {
    test(`${mode} window order selects the native event receiver`, async () => {
      const front = mode === 'top';
      const target = await common.runOnMainThread(() => {
        controller().configureInputWindow_(mode);
        return controller().inputWindowTarget_front_('click', front);
      });
      const before = await snapshot();
      const result = await drive.click(target);
      const blocked = mode === 'same' || mode === 'higher';
      expect(result.ok, JSON.stringify(result)).toBe(!blocked);
      const after = await snapshot();
      expect(after.baseClicks - before.baseClicks).toBe(!blocked && !front ? 1 : 0);
      expect(after.frontClicks - before.frontClicks).toBe(front ? 1 : 0);
    });
  }
  test('window visibility changes are observed on each input attempt', async () => {
    const target = await common.runOnMainThread(() => {
      controller().configureInputWindow_('same');
      return controller().inputWindowTarget_front_('click', false);
    });
    expect((await drive.click(target)).ok).toBe(false);
    await common.runOnMainThread(() => controller().configureInputWindow_('hide'));
    expect((await drive.click(target)).ok).toBe(true);
    await common.runOnMainThread(() => controller().configureInputWindow_('show'));
    expect((await drive.click(target)).ok).toBe(false);
    const after = await snapshot();
    expect(after.baseClicks).toBe(1);
    expect(after.frontClicks).toBe(0);
  });
  for (const [action, args] of [['input', ['hello']], ['longPress', []], ['scroll', ['up', 100]]]) {
    test(`a covering window rejects ${action} without changing native state`, async () => {
      const target = await common.runOnMainThread(() => {
        controller().configureInputWindow_('same');
        return controller().inputWindowTarget_front_(action, false);
      });
      const before = await snapshot();
      const result = await drive[action](target, ...args);
      expect(result.ok, JSON.stringify(result)).toBe(false);
      const after = await snapshot();
      for (const key of ['baseClicks', 'frontClicks', 'longPresses', 'text', 'scrollY']) {
        expect(after[key], key).toBe(before[key]);
      }
    });
  }

});
