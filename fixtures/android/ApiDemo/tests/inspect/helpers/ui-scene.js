import Java from 'frida-java-bridge';
const { runOnMainThread } = common;
// Native root lookup prepares the fixture; inspection uses the public SDK.
import { findFocusedRootView } from '../../../../../../sdk/android/element/query.js';

// Create a deterministic native subtree in ApiDemo without calling inspect.ui.
// Coordinates are deliberately raw px, so geometry assertions have independent constants.
export async function createScene() {
  const scene = await runOnMainThread(() => {
    const root = findFocusedRootView();
    if (!root) throw new Error('ApiDemo window is unavailable');
    const Group = Java.use('android.view.ViewGroup');
    const Frame = Java.use('android.widget.FrameLayout');
    const Params = Java.use('android.widget.FrameLayout$LayoutParams');
    const StringClass = Java.use('java.lang.String');
    const context = root.getContext();
    const panel = Frame.$new(context);
    panel.setTag(StringClass.$new('inspect.ui.panel'));
    panel.setBackgroundColor(-1);
    const parent = Frame.$new(context);
    parent.setTag(StringClass.$new('inspect.ui.parent'));
    const parentParams = Params.$new(240, 160);
    parentParams.leftMargin.value = 20;
    parentParams.topMargin.value = 40;
    panel.addView(parent, parentParams);
    const button = Java.use('android.widget.Button').$new(context);
    button.setTag(StringClass.$new('inspect.ui.button'));
    button.setId(Java.use('android.view.View').generateViewId());
    button.setText(StringClass.$new('Inspect'));
    const buttonParams = Params.$new(80, 40);
    buttonParams.leftMargin.value = 12;
    buttonParams.topMargin.value = 16;
    parent.addView(button, buttonParams);
    const field = Java.use('android.widget.EditText').$new(context);
    field.setTag(StringClass.$new('inspect.ui.field'));
    field.setShowSoftInputOnFocus(false);
    const fieldParams = Params.$new(180, 48);
    fieldParams.topMargin.value = 240;
    panel.addView(field, fieldParams);
    Java.cast(root, Group).addView(panel, Params.$new(320, 400));
    return { panel: Java.retain(panel), parent: Java.retain(parent), button: Java.retain(button), field: Java.retain(field) };
  });
  const deadline = Date.now() + 5000;
  while (!(await runOnMainThread(() => scene.button.getWidth() === 80 && scene.panel.isAttachedToWindow()))) {
    if (Date.now() >= deadline) throw new Error('Inspect scene did not layout');
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  return scene;
}
export async function removeScene(scene) {
  if (!scene) return;
  await runOnMainThread(() => {
    const parent = scene.panel.getParent();
    if (parent) Java.cast(parent, Java.use('android.view.ViewGroup')).removeView(scene.panel);
  });
  for (const view of Object.values(scene)) view.$dispose();
}
export function disposeTree(node) {
  for (const child of node.children) disposeTree(child);
  node.target.$dispose();
}
