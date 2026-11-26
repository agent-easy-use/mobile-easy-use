import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const classPath = () => ['identifier::api.ui.class.scope', 'class::UIButton'];

async function readText(target) {
  const view = await element.findUiView(target);
  return common.runOnMainThread(() => String(view.currentTitle()));
}
const id = name => `api.${name}`;
describe('ui.class', () => {
  beforeEach(() => openScene('Ui', 'class', 'api.ui.ready.class'));
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
