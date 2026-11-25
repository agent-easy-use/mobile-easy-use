import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const id = name => R.id[`api_${name.replaceAll('.', '_')}`];
describe('ui.visibility', () => {
  beforeEach(() => openScene('Ui', 'visibility', R.id.api_ui_ready));
  afterEach(returnHome);

  test('hidden and zero-size targets exist but are not visible', async () => {
    for (const target of [id('ui.hidden'), id('ui.zero_size')]) {
      expect(await inspect.ui.isExisting(target)).toBe(true);
      expect(await inspect.ui.isHidden(target)).toBe(true);
      expect(await inspect.ui.isVisible(target)).toBe(false);
    }
    expect(await inspect.ui.isEnabled(id('ui.disabled'))).toBe(false);
  });
});
