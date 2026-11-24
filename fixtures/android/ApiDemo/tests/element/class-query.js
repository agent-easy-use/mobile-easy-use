import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
describe('element class query boundaries', () => {
  beforeEach(() => openScene('Ui', 'class', R.id.api_ui_ready));
  afterEach(returnHome);
  test('exact class, superclass, mixed paths and self steps identify the same native view', async () => {
    for (const path of [
      ['class::com.agenteasyuse.mobileeasyuse.apidemo.ui.UiActivity$ClassButton'],
      [`id::${R.id.api_ui_class_scope}`, 'class::android.widget.Button'],
      [`id::${R.id.api_ui_class_scope}`, 'class::android.widget.TextView'],
      [`id::${R.id.api_ui_class_scope}`, 'class::com.agenteasyuse.mobileeasyuse.apidemo.ui.UiActivity$ClassButton', 'tag::FIRST'],
      [`id::${R.id.api_ui_class_first}`, 'class::android.widget.Button'],
    ]) {
      const view = await element.findUiView(path);
      expect(view !== null, JSON.stringify(path)).toBe(true);
      expect(await common.runOnMainThread(() => Number(view.getId()))).toBe(R.id.api_ui_class_first);
    }
  });
  for (const [name, path] of [
    ['missing class', [`id::${R.id.api_ui_class_scope}`, 'class::MissingClassButton']],
    ['case-sensitive class', [`id::${R.id.api_ui_class_scope}`, 'class::com.agenteasyuse.mobileeasyuse.apidemo.ui.uiactivity$classbutton']],
    ['base class is not its subclass', [`id::${R.id.api_ui_class_outside}`, 'class::com.agenteasyuse.mobileeasyuse.apidemo.ui.UiActivity$ClassButton']],
    ['no backtracking to a second matching sibling', [`id::${R.id.api_ui_class_scope}`, 'class::android.widget.Button', 'tag::SECOND']],
    ['no escaping the selected subtree', [`id::${R.id.api_ui_class_scope}`, 'class::com.agenteasyuse.mobileeasyuse.apidemo.ui.UiActivity$ClassButton', `id::${R.id.api_ui_class_outside}`]],
  ]) {
    test(name, async () => { expect(await element.findUiView(path)).toBe(null); });
  }
  test('hidden elements remain queryable', async () => {
    const path = [`id::${R.id.api_ui_class_hidden}`, 'class::com.agenteasyuse.mobileeasyuse.apidemo.ui.UiActivity$ClassButton'];
    expect(await element.findUiView(path) !== null).toBe(true);
    await expect(path).toBeHidden();
  });
  test('an empty class name is rejected', async () => {
    let error;
    try { await element.findUiView(['class::']); } catch (caught) { error = caught; }
    expect(String(error)).toMatch(/Invalid UI path/);
  });
});
