import ObjC from 'frida-objc-bridge';
import { drive } from '../../../../../sdk/ios/drive/index.js';
import { runOnMainThread } from '../../../../../sdk/ios/common/main-thread.js';
import { findUiView } from '../../../../../sdk/ios/element/query.js';

const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };

const TOUCH_UP_INSIDE = 64; // UIControlEventTouchUpInside

async function returnHome() {
  await runOnMainThread(() => {
    if (!findUiView('api.menu.input')) ObjC.classes.APIController.returnToMain();
  });
  const ready = await drive.wait('api.menu.input', 'visible');
  expect(ready.ok, 'Home is ready').toBe(true);
}

async function clickCount() {
  return runOnMainThread(() => JSON.parse(String(ObjC.classes.APIController.snapshotJSON())).counter);
}

async function openClickScene() {
  await returnHome();
  // Fixture navigation must not depend on drive.click, the API under test.
  // Invoke native button actions without injecting touches; the test body exercises drive.click.
  await runOnMainThread(() => findUiView('api.menu.input').sendActionsForControlEvents_(TOUCH_UP_INSIDE));
  const ready = await drive.wait('api.input.scenario.click', 'visible');
  expect(ready.ok, 'Click scenario menu is ready').toBe(true);
  await runOnMainThread(() => findUiView('api.input.scenario.click').sendActionsForControlEvents_(TOUCH_UP_INSIDE));
}

async function waitForClickCount(expectedCount) {
  const completed = await drive.waitUntil(
    async () => (await clickCount()) >= expectedCount
  );
  expect(completed.ok, 'Native click handler completed').toBe(true);
}

async function clickTargetCenter() {
  return runOnMainThread(() => {
    const view = findUiView('api.input.click');
    // Read UIKit geometry independently of the drive target resolver.
    // Frida represents CGRect and CGPoint as nested arrays.
    const [[x, y], [width, height]] = view.bounds();
    const center = [x + width / 2, y + height / 2];
    const [screenX, screenY] = view.convertPoint_toCoordinateSpace_(
      center, view.window().screen().coordinateSpace()
    );
    return { x: screenX, y: screenY };
  });
}

describe('drive.click', () => {
  beforeEach(async () => {
    await openClickScene();
    const ready = await drive.wait('api.input.click', 'visible');
    expect(ready.ok, 'Click target is ready').toBe(true);
    expect(await clickCount(), 'Initial native count').toBe(0);
  });

  afterEach(returnHome);

  test('click by identifier invokes the native handler exactly once', async () => {
    const result = await drive.click('api.input.click');
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('click accepts an array UI path', async () => {
    const result = await drive.click(['identifier::api.input.fixture', 'label::click fixture']);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('click accepts a native UIView', async () => {
    const view = await runOnMainThread(() => findUiView('api.input.click'));
    const result = await drive.click(view);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('click accepts screen coordinates in points', async () => {
    const point = await clickTargetCenter();
    const result = await drive.click(point);
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });

  test('two sequential clicks produce exactly two native callbacks', async () => {
    const result = await drive.click('api.input.click');
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);

    const secondClick = await drive.click('api.input.click');
    expect(secondClick.ok, 'Click succeeds').toBe(true);
    expect(secondClick.action, 'Reports the click action').toBe('click');

    await waitForClickCount(2);
    expect(await clickCount(), 'Cumulative native click count').toBe(2);
  });

  test('missing target is rejected without clicking', async () => {
    const countBefore = await clickCount();
    const rejected = await drive.click('api.tests.missing');

    expect(rejected.ok, 'Click is rejected').toBe(false);
    expect(rejected.error.code, 'Reports the expected failure').toBe('ELEMENT_NOT_FOUND');
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
    const view = await runOnMainThread(() => findUiView('api.input.click'));
    try {
      await runOnMainThread(() => view.setHidden_(true));
      const countBefore = await clickCount();
      const rejected = await drive.click('api.input.click');

      expect(rejected.ok, 'Click is rejected').toBe(false);
      expect(rejected.error.code, 'Reports the expected failure').toBe('VIEW_NOT_VISIBLE');
      expect(await clickCount(), 'Native click count is unchanged').toBe(countBefore);
    } finally {
      await runOnMainThread(() => view.setHidden_(false));
    }
  });

  test('valid click succeeds after a rejected click', async () => {
    const countBefore = await clickCount();
    const rejected = await drive.click('api.tests.missing');

    expect(rejected.ok, 'Click is rejected').toBe(false);
    expect(rejected.error.code, 'Reports the expected failure').toBe('ELEMENT_NOT_FOUND');
    expect(await clickCount(), 'Native click count is unchanged').toBe(countBefore);

    const result = await drive.click('api.input.click');
    expect(result.ok, 'Click succeeds').toBe(true);
    expect(result.action, 'Reports the click action').toBe('click');

    await waitForClickCount(1);
    expect(await clickCount(), 'Cumulative native click count').toBe(1);
  });
});
