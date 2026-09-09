/** Snapshot the first UIView matching an identifier in iOS ApiDemo's query window on main. No side effects.
 * Requires connected ApiDemo. Returns null when no View/window matches; hidden Views can match.
 * hidden/alpha are this View's properties, not effective visibility or clickability. Label is capped at 512 UTF-16 code units.
 * @param identifier Exact accessibility identifier such as api.menu.ui, non-empty and at most 128 characters.
 */
export function inspectElement(identifier: string): Promise<{
  identifier: string;
  className: string;
  hidden: boolean;
  alpha: number;
  attached: boolean;
  userInteractionEnabled: boolean;
  label: string | null;
} | null>;
