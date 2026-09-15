export interface StaticMethodOptions {
  /** m0–m10 select the matrix methods; other keys are listed in README.md. */
  key: string;
  /** Preparation performed before installing the Hook. Defaults to none. */
  preparation?: 'none' | 'snapshot' | 'warm' | 'initialize';
  /** java requires a fixture with an explicit Java call site. Defaults to wrapper. */
  trigger?: 'wrapper' | 'java';
  /** constant returns a diagnostic sentinel without invoking the original method. */
  behavior?: 'original' | 'constant';
  thread?: 'worker' | 'main';
}

/**
 * Android ApiDemo diagnostic. Requires a fresh App process for each call.
 * Installs one temporary static Hook, invokes it, reads the fixture's counter where
 * available, and restores the Hook. Genuine recursion allows depth 3; abnormal
 * recursion is bounded at 2 (5 for the recursive fixture). Guarding does not make
 * ART crashes impossible. Uses bridge 7.0.12 internals only to read the saved entry.
 */
export function probeStaticMethod(options: StaticMethodOptions | string): Promise<{
  pid: number;
  status: 'normal' | 'reentry' | 'bypassed' | 'inconclusive';
  entries: number;
  maxDepth: number;
  guarded: boolean;
  originalCalls: number | null;
  originalReturns: number;
  value: string | null;
  exception: string | null;
  savedEntry: { address: string; symbol: string };
  [key: string]: unknown;
}>;
