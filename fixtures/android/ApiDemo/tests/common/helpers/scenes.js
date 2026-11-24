import { returnHome as returnInputHome } from '../../drive/helpers/input-scene.js';
export async function returnHome() {
  if (!(await element.findUiView(R.id.api_menu_input))) await returnInputHome();
  const ready = await drive.wait(R.id.api_menu_input, 'visible');
  if (!ready.ok) throw new Error('Home did not become ready');
}
import Java from 'frida-java-bridge';
export async function openScene(capability, scenario, target) {
  // Native navigation keeps setup independent of the SDK operation under test.
  await common.runOnMainThread(() => {
    const app = Java.use('android.app.ActivityThread').currentApplication();
    const intent = Java.use('android.content.Intent').$new();
    intent.setClassName('com.agenteasyuse.mobileeasyuse.apidemo',
      `com.agenteasyuse.mobileeasyuse.apidemo.ui.${capability}Activity`);
    intent.putExtra.overload('java.lang.String', 'java.lang.String').call(intent, 'scenario', scenario);
    intent.addFlags(0x14010000);
    app.startActivity(intent);
  });
  const ready = await drive.wait(target, 'visible');
  if (!ready.ok) throw new Error(`Scene not ready: ${capability}/${scenario}`);
}
