import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
describe('element class query boundaries', () => {
  beforeEach(() => openScene('Ui', 'class', 'api.ui.ready.class'));
  afterEach(returnHome);
  test('exact class, superclass, mixed paths and self steps identify the same native view', async () => {
    for (const path of [
      ['class::APIClassButton'],
      [`identifier::api.ui.class.scope`, 'class::UIButton'],
      [`identifier::api.ui.class.scope`, 'class::UIControl'],
      [`identifier::api.ui.class.scope`, 'class::APIClassButton', 'label::FIRST'],
      [`identifier::api.ui.class.first`, 'class::UIButton'],
    ]) {
      const view = await element.findUiView(path);
      expect(view !== null, JSON.stringify(path)).toBe(true);
      expect(await common.runOnMainThread(() => String(view.accessibilityIdentifier()))).toBe('api.ui.class.first');
    }
  });
  for (const [name, path] of [
    ['missing class', [`identifier::api.ui.class.scope`, 'class::MissingClassButton']],
    ['case-sensitive class', [`identifier::api.ui.class.scope`, 'class::apiclassbutton']],
    ['base class is not its subclass', [`identifier::api.ui.class.outside`, 'class::APIClassButton']],
    ['no backtracking to a second matching sibling', [`identifier::api.ui.class.scope`, 'class::UIButton', 'label::SECOND']],
    ['no escaping the selected subtree', [`identifier::api.ui.class.scope`, 'class::APIClassButton', `identifier::api.ui.class.outside`]],
  ]) {
    test(name, async () => { expect(await element.findUiView(path)).toBe(null); });
  }
  test('hidden elements remain queryable', async () => {
    const path = [`identifier::api.ui.class.hidden`, 'class::APIClassButton'];
    expect(await element.findUiView(path) !== null).toBe(true);
    await expect(path).toBeHidden();
  });
  test('an empty class name is rejected', async () => {
    let error;
    try { await element.findUiView(['class::']); } catch (caught) { error = caught; }
    expect(String(error)).toMatch(/Invalid UI path/);
  });
});
