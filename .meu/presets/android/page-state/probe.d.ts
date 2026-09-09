/** Read Android ApiDemo UI/fixture state on main. Requires connected ApiDemo, makes no changes.
 * activity/scenario describe the last reset and may be stale on home; use homeVisible separately.
 * inputText is truncated to 512 UTF-16 code units. No navigation or waiting.
 */
export function inspectPageState(): Promise<{
  homeVisible: boolean;
  generation: number;
  activity: string;
  scenario: string;
  clickCount: number;
  longPressCount: number;
  inputText: string;
  scrollX: number;
  scrollY: number;
  dialogOpen: boolean;
  popupOpen: boolean;
}>;
