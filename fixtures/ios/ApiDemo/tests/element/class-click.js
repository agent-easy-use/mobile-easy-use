import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const classPath = () => ['identifier::api.ui.class.scope', 'class::UIButton'];
const targetText = view => String(view.currentTitle());
const id = name => `api.${name}`;
describe('ui.class', () => {
  beforeEach(() => openScene('Ui', 'class', 'api.ui.ready.class'));
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
