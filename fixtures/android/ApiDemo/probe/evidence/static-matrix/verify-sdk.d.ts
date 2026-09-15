/** Cold-start ApiDemo before each invocation. Exercises SDK static-hook preparation with 100 calls.
 * Uses an initialized class to reproduce the affected state; no mocks or global deoptimization.
 * Compare entries/originalCalls as well as return values: missing hooks must not count as success.
 */
export declare function verifyStaticHookFix(options?: {
  api?: 'override' | 'chain';
  key?: 'integer' | 'recursive' | 'fail';
  trigger?: 'wrapper' | 'java';
  thread?: 'main' | 'worker';
  /** filter exercises original-call fallback; callback-error is for nonthrowing integer only. */
  mode?: 'filter' | 'callback-error';
}): Promise<{
  pid: number; options: object; entries: number; originalCalls: number;
  completed: number; errors: number; lastValue?: string; seen: string[][];
  cleaned: boolean; passed: boolean;
}>;
