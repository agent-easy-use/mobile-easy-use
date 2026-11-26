import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const classPath = () => [`id::${R.id.api_ui_class_scope}`, 'class::android.widget.Button'];

async function readText(target) {
  const view = await element.findUiView(target);
  return common.runOnMainThread(() => String(view.getText()));
}
const id = name => R.id[`api_${name.replaceAll('.', '_')}`];
describe('ui.class', () => {
  beforeEach(() => openScene('Ui', 'class', R.id.api_ui_ready));
  afterEach(returnHome);

  test('class path clicks first descendant and preserves sibling', async () => {
    expect(await inspect.ui.isVisible(classPath())).toBe(true);
    expect(await inspect.ui.isEnabled(classPath())).toBe(true);
    expect(await readText(classPath())).toBe('FIRST');
    expect((await drive.click(classPath())).ok).toBe(true);

    expect(await readText(id('ui.class.first'))).toBe('FIRST:1');
    expect(await readText(id('ui.class.second'))).toBe('SECOND');
  });
});
