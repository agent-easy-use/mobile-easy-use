import Java from 'frida-java-bridge';
const { runOnMainThread } = common;
// Synchronous native lookup for scene setup/readback inside main-thread callbacks.
import { findUiView } from '../../../../../sdk/android/element/query.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

const PACKAGE = 'com.agenteasyuse.mobileeasyuse.apidemo';

async function returnHome() {
  await runOnMainThread(() => Java.use(`${PACKAGE}.control.ApiDemoController`).returnToMain());
  const ready = await drive.wait(R.id.api_menu_input, 'visible');
  expect(ready.ok, 'Home is ready').toBe(true);
}

async function clickCount() {
  return runOnMainThread(() => Java.use(`${PACKAGE}.state.ApiDemoState`).getInstance().getClickCount());
}

async function openClickScene() {
  // Fixture navigation must not depend on drive.click, the API under test.
  // Open the Activity natively so a click regression is exposed by the test body.
  await runOnMainThread(() => {
    const app = Java.use('android.app.ActivityThread').currentApplication();
    const intent = Java.use('android.content.Intent').$new();
    intent.setClassName(PACKAGE, `${PACKAGE}.ui.InputActivity`);
    intent.putExtra.overload('java.lang.String', 'java.lang.String').call(intent, 'scenario', 'click');
    intent.addFlags(0x14010000); // NEW_TASK | CLEAR_TOP | NO_ANIMATION: fresh fixture without moving touch coordinates
    app.startActivity(intent);
  });
}

async function waitForClickCount(expectedCount) {
  const completed = await drive.waitUntil(
    async () => (await clickCount()) >= expectedCount
  );
  expect(completed.ok, 'Native click handler completed').toBe(true);
}

async function clickTargetCenter() {
  return runOnMainThread(() => {
    const view = findUiView(R.id.api_input_click);
    const location = Java.array('int', [0, 0]);
    view.getLocationOnScreen(location);
    return { x: location[0] + view.getWidth() / 2, y: location[1] + view.getHeight() / 2 };
  });
}

describe('drive.click', () => {
  beforeEach(async () => {
    await openClickScene();
    const ready = await drive.wait(R.id.api_input_click, 'visible');
    expect(ready.ok, 'Click target is ready').toBe(true);
    expect(await clickCount(), 'Initial native count').toBe(0);
  });

  afterEach(returnHome);

  test('click by resource ID invokes the native handler exactly once', async () => {
    const result = await drive.click(R.id.api_input_click);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('click accepts an array UI path', async () => {
    const result = await drive.click([`id::${R.id.api_input_fixture_container}`, 'text::CLICK_TARGET']);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('click accepts a native View', async () => {
    const view = await runOnMainThread(() => Java.retain(findUiView(R.id.api_input_click)));
    try {
      const result = await drive.click(view);
      expect(result.ok, 'Click succeeds').toBe(true);
      expect(result.action, 'Reports the click action').toBe('click');

      await waitForClickCount(1);
      expect(await clickCount(), 'Cumulative native click count').toBe(1);
    } finally {
      view.$dispose();
    }
  });

  test('click accepts screen coordinates in pixels', async () => {
    const point = await clickTargetCenter();
    const result = await drive.click(point);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('two sequential clicks produce exactly two native callbacks', async () => {
    const result = await drive.click(R.id.api_input_click);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);

    const secondClick = await drive.click(R.id.api_input_click);
    expect(secondClick.ok, 'Click succeeds').toBe(true);
    expect(secondClick.action, 'Reports the click action').toBe('click');

    await waitForClickCount(2);
    expect(await clickCount(), 'Cumulative native click count').toBe(2);
  });

  test('missing target is rejected without clicking', async () => {
    const countBefore = await clickCount();
    const rejected = await drive.click(['tag::apidemo-tests-missing']);

    expect(rejected.ok, 'Click is rejected').toBe(false);
    expect(rejected.error.code, 'Reports the expected failure').toBe('VIEW_NOT_FOUND');
    expect(await clickCount(), 'Native click count is unchanged').toBe(countBefore);
  });

  for (const [name, target, code] of [
    ['missing argument', undefined, 'INVALID_TARGET'],
    ['unsupported target object', {}, 'INVALID_TARGET'],
    ['negative coordinates', { x: -1, y: 10 }, 'INVALID_COORDINATES'],
    ['NaN coordinate', { x: NaN, y: 10 }, 'INVALID_TARGET'],
    ['infinite coordinate', { x: 10, y: Infinity }, 'INVALID_TARGET'],
  ]) {
    test(`rejects ${name} without clicking`, async () => {
      const countBefore = await clickCount();
      const rejected = await drive.click(target);

      expect(rejected.ok, 'Click is rejected').toBe(false);
      expect(rejected.error.code, 'Reports the expected failure').toBe(code);
      expect(await clickCount(), 'Native click count is unchanged').toBe(countBefore);
    });
  }

  test('hidden target is rejected without clicking', async () => {
    const view = await runOnMainThread(() => Java.retain(findUiView(R.id.api_input_click)));
    try {
      await runOnMainThread(() => view.setVisibility(4)); // INVISIBLE
      const countBefore = await clickCount();
      const rejected = await drive.click(R.id.api_input_click);

      expect(rejected.ok, 'Click is rejected').toBe(false);
      expect(rejected.error.code, 'Reports the expected failure').toBe('VIEW_NOT_VISIBLE');
      expect(await clickCount(), 'Native click count is unchanged').toBe(countBefore);
    } finally {
      await runOnMainThread(() => view.setVisibility(0)); // VISIBLE
      view.$dispose();
    }
  });

  test('valid click succeeds after a rejected click', async () => {
    const countBefore = await clickCount();
    const rejected = await drive.click(['tag::apidemo-tests-missing']);

    expect(rejected.ok, 'Click is rejected').toBe(false);
    expect(rejected.error.code, 'Reports the expected failure').toBe('VIEW_NOT_FOUND');
    expect(await clickCount(), 'Native click count is unchanged').toBe(countBefore);

    const result = await drive.click(R.id.api_input_click);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });
});
