import { openScene, returnHome } from '../common/helpers/scenes.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const path = () => [`id::${R.id.api_ui_nested_parent}`, 'tag::api-nested-child'];
const missing = () => ['tag::apidemo-tests-missing'];
describe('ui.path', () => {
  beforeEach(() => openScene('Ui', 'path', R.id.api_ui_ready));
  afterEach(returnHome);

  test('descendant path resolves the expected native child', async () => {
    expect(await inspect.ui.isExisting(path())).toBe(true);
    const view = await element.findUiView(path());
    const nativeId = await common.runOnMainThread(() => Number(view.getId()));
    expect(nativeId).toBe(R.id.api_ui_nested_child);
    expect(await inspect.ui.isExisting(missing())).toBe(false);
    expect(await inspect.ui.isHidden(missing())).toBe(false); // Missing is different from hidden.
  });
});
