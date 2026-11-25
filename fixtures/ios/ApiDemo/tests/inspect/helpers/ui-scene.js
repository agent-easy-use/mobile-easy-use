import ObjC from 'frida-objc-bridge';
const { runOnMainThread } = common;

// Fixture setup uses UIKit directly, independently of the inspect API under test.
export async function createScene() {
  return runOnMainThread(() => {
    const window = ObjC.classes.MEUUIQuery.focusedWindow();
    if (!window) throw new Error('ApiDemo window is unavailable');
    const panel = ObjC.classes.UIView.alloc().initWithFrame_([[0, 0], [320, 400]]);
    panel.setAccessibilityIdentifier_('inspect.ui.panel');
    panel.setBackgroundColor_(ObjC.classes.UIColor.whiteColor());
    const parent = ObjC.classes.UIView.alloc().initWithFrame_([[20, 40], [240, 160]]);
    parent.setAccessibilityIdentifier_('inspect.ui.parent');
    panel.addSubview_(parent);
    const button = ObjC.classes.UIButton.alloc().initWithFrame_([[12, 16], [80, 40]]);
    button.setAccessibilityIdentifier_('inspect.ui.button');
    button.setTitle_forState_('Inspect', 0);
    button.setTitleColor_forState_(ObjC.classes.UIColor.blackColor(), 0);
    parent.addSubview_(button);
    const field = ObjC.classes.UITextField.alloc().initWithFrame_([[0, 240], [180, 48]]);
    field.setAccessibilityIdentifier_('inspect.ui.field');
    panel.addSubview_(field);
    window.addSubview_(panel);
    window.layoutIfNeeded();
    return { panel, parent, button, field };
  });
}
export async function removeScene(scene) {
  if (!scene) return;
  await runOnMainThread(() => {
    scene.field.resignFirstResponder();
    scene.panel.removeFromSuperview();
    for (const view of Object.values(scene)) view.release();
  });
}
