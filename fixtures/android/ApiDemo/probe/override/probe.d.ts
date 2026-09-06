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
