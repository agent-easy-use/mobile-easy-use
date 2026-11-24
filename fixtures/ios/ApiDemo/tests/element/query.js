import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const path = () => ['identifier::api.ui.nested.parent', 'label::API_FIXED_LABEL'];
const hasNestedId = view => String(view.accessibilityIdentifier()) === 'api.ui.nested.child';
const missing = () => 'api.tests.missing';
describe('ui.path', () => {
  beforeEach(() => openScene('Ui', 'path', 'api.ui.ready.path'));
  afterEach(returnHome);

  test('descendant path resolves the expected native child', async () => {
    await expect(path()).toExist();
    await expect(path()).toSatisfy(hasNestedId);
    await expect(missing()).not.toExist();
    await expect(missing()).not.toBeHidden(); // Missing is different from hidden.
  });
});
