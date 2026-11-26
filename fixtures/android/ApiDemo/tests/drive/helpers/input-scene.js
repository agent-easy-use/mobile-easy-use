import Java from 'frida-java-bridge';
const { runOnMainThread } = common;
// Synchronous native lookup for scene setup/readback inside main-thread callbacks.
import { findUiView } from '../../../../../../sdk/android/element/query.js';
const PACKAGE = 'com.agenteasyuse.mobileeasyuse.apidemo';
export async function openScene(scenario, target) {
  // Navigate natively: setup must not depend on the input API being tested.
  await runOnMainThread(() => {
    const app = Java.use('android.app.ActivityThread').currentApplication();
    const intent = Java.use('android.content.Intent').$new();
    intent.setClassName(PACKAGE, `${PACKAGE}.ui.InputActivity`);
    intent.putExtra.overload('java.lang.String', 'java.lang.String').call(intent, 'scenario', scenario);
    intent.addFlags(0x14010000); // NEW_TASK | CLEAR_TOP | NO_ANIMATION
    app.startActivity(intent);
  });
  const ready = await drive.wait(target, 'visible');
  if (!ready.ok) throw new Error(`Input scene not ready: ${scenario}`);
}
export async function returnHome() {
  await runOnMainThread(() => Java.use(`${PACKAGE}.control.ApiDemoController`).returnToMain());
  const ready = await drive.wait(R.id.api_menu_input, 'visible');
  if (!ready.ok) throw new Error('Home did not become ready');
}
export function readInputText() {
  // The fixture's native TextWatcher records the actual text delivered by input.
  return runOnMainThread(() => String(Java.use(`${PACKAGE}.state.ApiDemoState`).getInstance().getInputText()));
}
export function readLongPressCount() {
  return runOnMainThread(() => Number(Java.use(`${PACKAGE}.state.ApiDemoState`).getInstance().getLongPressCount()));
}
export function readOffset(target, axis) {
  return runOnMainThread(() => Number(axis === 'x' ? findUiView(target).getScrollX() : findUiView(target).getScrollY()));
}
