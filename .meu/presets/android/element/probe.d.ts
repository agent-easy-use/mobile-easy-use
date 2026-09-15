/** Snapshot the first matching View in Android ApiDemo's focused window on main. No side effects.
 * Requires connected ApiDemo. Returns null for an unknown ID, missing View or absent focused window.
 * shown follows View.isShown(), not viewport intersection or clickability. Text is capped at 512 UTF-16 code units.
 * @param resourceName Resource entry name such as api_menu_ui (no R.id. prefix), at most 128 characters.
 */
export function inspectElement(resourceName: string): Promise<{
  resourceName: string;
  resourceId: number;
  className: string;
  shown: boolean;
  attached: boolean;
  enabled: boolean;
  width: number;
  height: number;
  text: string | null;
} | null>;
