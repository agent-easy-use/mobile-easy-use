import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const path = () => [`id::${R.id.api_ui_nested_parent}`, 'tag::api-nested-child'];
const hasNestedId = view => Number(view.getId()) === R.id.api_ui_nested_child;
const missing = () => ['tag::apidemo-tests-missing'];
describe('ui.path', () => {
  beforeEach(() => openScene('Ui', 'path', R.id.api_ui_ready));
  afterEach(returnHome);

  test('descendant path resolves the expected native child', async () => {
    await expect(path()).toExist();
    await expect(path()).toSatisfy(hasNestedId);
    await expect(missing()).not.toExist();
    await expect(missing()).not.toBeHidden(); // Missing is different from hidden.
  });
});
