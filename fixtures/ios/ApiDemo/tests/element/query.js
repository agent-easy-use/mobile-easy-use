import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const path = () => ['identifier::api.ui.nested.parent', 'label::API_FIXED_LABEL'];
const missing = () => 'api.tests.missing';
describe('ui.path', () => {
  beforeEach(() => openScene('Ui', 'path', 'api.ui.ready.path'));
  afterEach(returnHome);

  test('descendant path resolves the expected native child', async () => {
    expect(await inspect.ui.isExisting(path())).toBe(true);
    const view = await element.findUiView(path());
    const nativeId = await common.runOnMainThread(() => String(view.accessibilityIdentifier()));
    expect(nativeId).toBe('api.ui.nested.child');
    expect(await inspect.ui.isExisting(missing())).toBe(false);
    expect(await inspect.ui.isHidden(missing())).toBe(false); // Missing is different from hidden.
  });
});
