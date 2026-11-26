import { inspectRuntime } from '../runtime/index.js';

export async function inspectElement(resourceName) {
  if (typeof resourceName !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/.test(resourceName)) {
    throw new Error('resourceName must be an Android resource entry name, at most 128 characters');
  }
  inspectRuntime();
  const resourceId = R.id[resourceName];
  const view = resourceId > 0 ? await element.findUiView(resourceId) : null;
  if (view === null) return null;
  return common.runOnMainThread(() => {
    const text = typeof view.getText === 'function' ? view.getText() : null;
    return {
      resourceName,
      resourceId,
      className: view.getClass().getName().toString(),
      shown: Boolean(view.isShown()),
      attached: Boolean(view.isAttachedToWindow()),
      enabled: Boolean(view.isEnabled()),
      width: view.getWidth(),
      height: view.getHeight(),
      text: text === null ? null : text.toString().slice(0, 512),
    };
  });
}
