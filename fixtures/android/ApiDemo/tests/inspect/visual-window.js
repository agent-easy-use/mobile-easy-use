import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const BASELINE = `${__MEU_REPO_ROOT__}/fixtures/android/ApiDemo/tests/baselines/home-window.jpg`;
describe('fixed window baseline', () => {
  beforeEach(returnHome);
  afterEach(returnHome);
  test('home matches its reviewed baseline and another page does not', async () => {
    expect(await inspect.ui.isVisible(R.id.api_menu_ui)).toBe(true);
    await expect().toMatchWindowScreenshot(BASELINE, { maxDiffPixelRatio: 0 });
    await openScene('Ui', 'class', R.id.api_ui_ready);
    await expect().not.toMatchWindowScreenshot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
