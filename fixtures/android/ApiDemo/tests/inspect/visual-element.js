import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const BASELINE = `${__MEU_REPO_ROOT__}/fixtures/android/ApiDemo/tests/baselines/class-first.jpg`;
describe('screenshot', () => {
  beforeEach(() => openScene('Ui', 'class', R.id.api_ui_ready));
  afterEach(returnHome);

  test('FIRST matches the reviewed baseline', async () => {
    await expect(R.id.api_ui_class_first).toSatisfy(view => String(view.getText()) === 'FIRST');
    await expect(R.id.api_ui_class_first).toMatchElementScreenshot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
