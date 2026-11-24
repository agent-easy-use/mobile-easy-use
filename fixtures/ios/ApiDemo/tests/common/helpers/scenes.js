export { returnHome } from '../../drive/helpers/input-scene.js';
import { returnHome } from '../../drive/helpers/input-scene.js';
export async function openScene(capability, scenario, target) {
  await returnHome();
  // Native control actions navigate without relying on drive.click.
  const category = capability.toLowerCase();
  const menu = await element.findUiView(`api.menu.${category}`);
  await common.runOnMainThread(() => menu.sendActionsForControlEvents_(64));
  const selector = `api.${category}.scenario.${scenario}`;
  const ready = await drive.wait(selector, 'exists');
  if (!ready.ok) throw new Error(`Scenario missing: ${selector}`);
  const button = await element.findUiView(selector);
  await common.runOnMainThread(() => button.sendActionsForControlEvents_(64));
  const opened = await drive.wait(target, 'visible');
  if (!opened.ok) throw new Error(`Scene not ready: ${category}/${scenario}`);
}
