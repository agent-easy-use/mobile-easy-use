/** Verify all three android ApiDemo presets through the connect-loaded bundle.
 * Requires ApiDemo on its home page and presets from this repository's .meu config.
 * Checks a present element, missing element and rejected invalid input; throws on failure.
 * Read-only: no navigation, state changes or hooks. Returns transportable diagnostic snapshots.
 */
export function verifyPresets(): Promise<{
  ok: true;
  runtime: Record<string, unknown>;
  page: Record<string, unknown>;
  element: Record<string, unknown>;
  missing: null;
  invalidRejected: true;
}>;
