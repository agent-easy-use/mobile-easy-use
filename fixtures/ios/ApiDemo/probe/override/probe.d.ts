export interface OverrideProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Replace an Objective-C instance method and prove the original IMP is restored. */
export declare function probeInstanceOverride(): Promise<OverrideProbeResult>;
/** Replace an Objective-C class method and prove class-selector restoration. */
export declare function probeClassOverride(): Promise<OverrideProbeResult>;
/** Apply an argument filter and allow an unmatched call through exactly once. */
export declare function probeFilteredOverride(): Promise<OverrideProbeResult>;
/** Keep an override installed through Promise settlement and clean it afterward. */
export declare function probeAsyncCleanup(): Promise<OverrideProbeResult>;

/** Assign scalar and object fields, then verify native values and restored reference identity. */
export declare function probeFieldValues(): Promise<OverrideProbeResult>;
/** Verify field cleanup on action failure and partial installation rollback. */
export declare function probeFieldFailures(): Promise<OverrideProbeResult>;
/** Verify native object lifetimes across an asynchronous field scope. */
export declare function probeFieldObjectLifetime(): Promise<OverrideProbeResult>;

/** Check replacement factories, filters and exactly-once fallback using native call counters. */
export declare function probeMethodCallbacks(): Promise<OverrideProbeResult>;
/** Check method cleanup on throw/rejection and partial installation failures. */
export declare function probeMethodFailures(): Promise<OverrideProbeResult>;
/** Check integer widths, UInt64, float, Foundation object values and instance isolation. */
export declare function probeFieldTypes(): Promise<OverrideProbeResult>;
/** Check object reference restoration, null assignment and repeated scopes. */
export declare function probeFieldReferenceScopes(): Promise<OverrideProbeResult>;
