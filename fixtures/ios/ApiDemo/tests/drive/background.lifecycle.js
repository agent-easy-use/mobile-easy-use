import ObjC from 'frida-objc-bridge';
import { requestController } from '../../../../../sdk/common/controller.js';
import { prepareInputCommand } from '../../../../../sdk/ios/drive/input/input-target.js';
import { openScene, returnHome } from './helpers/input-scene.js';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const count = () => common.runOnMainThread(() => JSON.parse(String(ObjC.classes.APIController.snapshotJSON())).counter);
export function pid() { return Process.id; }
export async function arm() {
  await openScene('click', 'api.input.click');
  const warm = await drive.click('api.input.click');
  expect(warm.ok, JSON.stringify(warm)).toBe(true);
  const command = await common.runOnMainThread(() => prepareInputCommand('click', 'api.input.click'));
  const before = await count();
  const keptAlive = await common.runOnMainThread(() => Boolean(ObjC.classes.APISDKFixtureState.sharedState().beginBackgroundWork()));
  expect(keptAlive, 'Native background task keeps the fixture alive').toBe(true);
  // Move the real App to background after the Runner has bound to it. This
  // exercises the native state check, without replacing XCUIApplication.state.
  await common.runOnMainThread(() => ObjC.classes.UIApplication.sharedApplication().performSelector_(ObjC.selector('suspend')));
  const backgrounded = await drive.waitUntil(() => common.runOnMainThread(
    () => Number(ObjC.classes.UIApplication.sharedApplication().applicationState()) === 2));
  expect(backgrounded.ok, 'App reaches UIApplicationStateBackground').toBe(true);
  command.expiresAt = Date.now() + 10000;
  const reply = await requestController('ios.input.perform', { command }, 10000);
  expect(reply.ok, 'Controller request completes').toBe(true);
  expect(reply.responsePayload.ok).toBe(false);
  expect(reply.responsePayload.error.code).toBe('TARGET_NOT_FOREGROUND');
  expect(await count()).toBe(before);
  return { armed: true, pid: Process.id };
}
describe('input foreground lifecycle', () => {
  afterEach(async () => {
    await common.runOnMainThread(() => ObjC.classes.APISDKFixtureState.sharedState().endBackgroundWork());
    await returnHome();
  });
  test('foreground restoration and reconnect permit native input in the same App', async () => {
    await openScene('click', 'api.input.click');
    const before = await count();
    const result = await drive.click('api.input.click');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await count()).toBe(before + 1);
  });
});
