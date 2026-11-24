import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const id = name => `api.${name}`;
describe('ui.visibility', () => {
  beforeEach(() => openScene('Ui', 'visibility', 'api.ui.ready.visibility'));
  afterEach(returnHome);

  test('hidden and zero-size targets exist but are not visible', async () => {
    for (const target of [id('ui.hidden'), id('ui.zero-size')]) {
      await expect(target).toExist();
      await expect(target).toBeHidden();
      await expect(target).not.toBeVisible();
    }
    await expect(id('ui.visible')).toBeVisible();
  });
});
