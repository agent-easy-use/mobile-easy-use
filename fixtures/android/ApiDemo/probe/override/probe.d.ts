export interface OverrideProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Replace a single Java method, then prove the original is restored outside scope. */
export declare function probeSingleOverride(): Promise<OverrideProbeResult>;
/** Replace only the int overload and prove the String overload remains original. */
export declare function probeExactOverload(): Promise<OverrideProbeResult>;
/** Apply a synchronous argument filter and verify the unmatched call reaches original once. */
export declare function probeFilteredOverride(): Promise<OverrideProbeResult>;
/** Keep an override through Promise settlement and verify cleanup afterward. */
export declare function probeAsyncCleanup(): Promise<OverrideProbeResult>;

/** Assign scalar and object fields, then verify native values and restored reference identity. */
export declare function probeFieldValues(): Promise<OverrideProbeResult>;
/** Verify field cleanup on action failure and partial installation rollback. */
export declare function probeFieldFailures(): Promise<OverrideProbeResult>;

/** Check replacement factories, filters and exactly-once fallback using native call counters. */
export declare function probeMethodCallbacks(): Promise<OverrideProbeResult>;
/** Check method cleanup on throw/rejection and partial installation failures. */
export declare function probeMethodFailures(): Promise<OverrideProbeResult>;
/** Check all overloads, invalid selection and exactly-once fallback to a throwing original. */
export declare function probeMethodSelection(): Promise<OverrideProbeResult>;
/** Check null values, per-instance assignment and repeated static restoration. */
export declare function probeFieldIsolation(): Promise<OverrideProbeResult>;

/** Compare baseline and overridden real input with state, UI and chain evidence; verify restoration. */
export declare function probeComposedOverride(): Promise<OverrideProbeResult>;
