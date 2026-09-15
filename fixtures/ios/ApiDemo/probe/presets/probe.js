import { inspectRuntime, inspectPageState, inspectElement } from '/meu/presets.js';

export async function verifyPresets() {
  const runtime = inspectRuntime();
  const page = await inspectPageState();
  const element = await inspectElement('api.menu.ui');
  const missing = await inspectElement('api.presets.missing');
  let invalidRejected = false;
  try { await inspectElement(''); } catch { invalidRejected = true; }
  if (!page.homeAttached || !element?.attached || missing !== null || !invalidRejected) {
    throw new Error(`Presets verification failed: ${JSON.stringify({ page, element, missing, invalidRejected })}`);
  }
  return { ok: true, runtime, page, element, missing, invalidRejected };
}
