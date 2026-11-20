import ObjC from 'frida-objc-bridge';
import { drive } from '../../../../../../sdk/ios/drive/index.js';
import { runOnMainThread } from '../../../../../../sdk/ios/common/main-thread.js';
import { findUiView } from '../../../../../../sdk/ios/element/query.js';
const TOUCH_UP_INSIDE = 64;
export async function returnHome() {
  await runOnMainThread(() => {
    if (!findUiView('api.menu.input')) ObjC.classes.APIController.returnToMain();
  });
  const ready = await drive.wait('api.menu.input', 'visible');
  if (!ready.ok) throw new Error('Home did not become ready');
}
export async function openScene(scenario, target) {
  await returnHome();
  // Native control actions navigate without testing drive.click during setup.
  await runOnMainThread(() => findUiView('api.menu.input').sendActionsForControlEvents_(TOUCH_UP_INSIDE));
  const menu = `api.input.scenario.${scenario}`;
  const ready = await drive.wait(menu, 'exists');
  if (!ready.ok) throw new Error(`Scenario menu missing: ${scenario}`);
  await runOnMainThread(() => findUiView(menu).sendActionsForControlEvents_(TOUCH_UP_INSIDE));
  const opened = await drive.wait(target, 'visible');
  if (!opened.ok) throw new Error(`Input scene not ready: ${scenario}`);
}
export function readInputText() {
  return runOnMainThread(() => String(findUiView('api.input.text').text()));
}
export function readLongPressCount() {
  return runOnMainThread(() => Number(ObjC.classes.APISDKFixtureState.sharedState().activationCount()));
}
export function readOffset(target, axis) {
  return runOnMainThread(() => {
    const offset = findUiView(target).contentOffset();
    return offset[axis === 'x' ? 0 : 1];
  });
}
