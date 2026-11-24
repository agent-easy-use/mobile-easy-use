import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const BASELINE = `${__MEU_REPO_ROOT__}/fixtures/ios/ApiDemo/tests/baselines/class-first.jpg`;
describe('screenshot', () => {
  beforeEach(() => openScene('Ui', 'class', 'api.ui.ready.class'));
  afterEach(returnHome);

  test('FIRST matches the reviewed baseline', async () => {
    await expect('api.ui.class.first').toSatisfy(view => String(view.currentTitle()) === 'FIRST');
    await expect('api.ui.class.first').toMatchElementScreenshot(BASELINE, { maxDiffPixelRatio: 0 });
  });
});
