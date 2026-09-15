/** Read android ApiDemo runtime metadata. Requires its connected SDK; throws for another App. No side effects. */
export function inspectRuntime(): {
  platform: 'android';
  available: boolean;
  appId: string | null;
  releaseVersion: string | null;
};
