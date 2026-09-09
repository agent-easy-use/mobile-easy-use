/** Read ios ApiDemo runtime metadata. Requires its connected SDK; throws for another App. No side effects. */
export function inspectRuntime(): {
  platform: 'ios';
  available: boolean;
  appId: string | null;
  releaseVersion: string | null;
};
