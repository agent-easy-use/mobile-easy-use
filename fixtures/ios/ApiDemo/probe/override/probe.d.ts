export interface OverrideProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Replace an Objective-C instance method and prove the original IMP is restored. */
export declare function probeInstanceOverride(): Promise<OverrideProbeResult>;
/** Replace an Objective-C class method and prove class-selector restoration. */
export declare function probeClassOverride(): Promise<OverrideProbeResult>;
/** Apply an argument filter and allow an unmatched call through exactly once. */
export declare function probeFilteredOverride(): Promise<OverrideProbeResult>;
/** Keep an override installed through Promise settlement and clean it afterward. */
export declare function probeAsyncCleanup(): Promise<OverrideProbeResult>;
