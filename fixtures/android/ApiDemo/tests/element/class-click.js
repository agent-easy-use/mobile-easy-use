import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const classPath = () => [`id::${R.id.api_ui_class_scope}`, 'class::android.widget.Button'];
const targetText = view => String(view.getText());
const id = name => R.id[`api_${name.replaceAll('.', '_')}`];
describe('ui.class', () => {
  beforeEach(() => openScene('Ui', 'class', R.id.api_ui_ready));
  afterEach(returnHome);

  test('class path clicks first descendant and preserves sibling', async () => {
    await expect(classPath()).toBeVisible();
    await expect(classPath()).toBeEnabled();
    await expect(classPath()).toSatisfy(view => targetText(view) === 'FIRST');
    expect((await drive.click(classPath())).ok).toBe(true);

    await expect(id('ui.class.first')).toSatisfy(view => targetText(view) === 'FIRST:1');
    await expect(id('ui.class.second')).toSatisfy(view => targetText(view) === 'SECOND');
  });
});
