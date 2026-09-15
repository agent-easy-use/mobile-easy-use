/** Read iOS ApiDemo UI/fixture state on main. Requires connected ApiDemo, makes no changes.
 * category/scenario describe the last fixture reset; homeAttached only reports home View attachment.
 * text is truncated to 512 UTF-16 code units. No navigation or waiting.
 */
export function inspectPageState(): Promise<{
  homeAttached: boolean;
  generation: number;
  category: string;
  scenario: string;
  counter: number;
  activationCount: number;
  text: string;
}>;
