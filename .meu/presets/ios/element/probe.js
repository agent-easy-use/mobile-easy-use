import { inspectRuntime } from '../runtime/probe.js';

export async function inspectElement(identifier) {
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 128) {
    throw new Error('identifier must be a non-empty accessibility identifier, at most 128 characters');
  }
  inspectRuntime();
  return IOS.runOnMainThread(() => {
    const view = IOS.ui.find(identifier);
    if (view === null) return null;
    const label = view.accessibilityLabel();
    return {
      identifier,
      className: view.$className,
      hidden: Boolean(view.isHidden()),
      alpha: Number(view.alpha()),
      attached: view.window() !== null,
      userInteractionEnabled: Boolean(view.isUserInteractionEnabled()),
      label: label === null ? null : label.toString().slice(0, 512),
    };
  });
}
