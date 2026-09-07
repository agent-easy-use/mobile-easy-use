export interface ChainEvidenceProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; evidenceContract?: string; }
/** Method and native log evidence with all capture fields. */
export declare function probeMethodAndLogChain(): Promise<ChainEvidenceProbeResult>;

/** Real allocation/delay, Objective-C pointer decoding and all resource fields. */
export declare function probeCaptureSuccess(): Promise<ChainEvidenceProbeResult>;

/** Nested native calls retain their own entry arguments and leave results. */
export declare function probeCaptureRecursive(): Promise<ChainEvidenceProbeResult>;

/** Extractor exceptions preserve business behavior and resource capture. */
export declare function probeCaptureExtractorErrors(): Promise<ChainEvidenceProbeResult>;

/** Native BOOL, signed byte, exact 64-bit strings, nil and void decoding. */
export declare function probeCaptureScalars(): Promise<ChainEvidenceProbeResult>;

/** Unsupported floating-point and aggregate ABIs report capture errors without guessing. */
export declare function probeCaptureUnsupportedABI(): Promise<ChainEvidenceProbeResult>;

/** Each independent option, empty/disabled capture, and immutable JSON snapshots. */
export declare function probeCaptureOptions(): Promise<ChainEvidenceProbeResult>;

/** Reject invalid JSON values independently at enter and leave, preserving business behavior. */
export declare function probeCaptureInvalidValues(): Promise<ChainEvidenceProbeResult>;

/** Invalid configuration must reject before action execution and release earlier hooks. */
export declare function probeCaptureConfigMatrix(): Promise<ChainEvidenceProbeResult>;

/** Promise resolution/rejection releases hooks; the original action error survives unchanged. */
export declare function probeCaptureAsyncCleanup(): Promise<ChainEvidenceProbeResult>;

/** A false/throwing filter must skip extractors and leave native calls unchanged. */
export declare function probeCaptureFilterErrors(): Promise<ChainEvidenceProbeResult>;

/** Two native worker threads overlap while keeping their entry/exit capture independent. */
export declare function probeCaptureConcurrent(): Promise<ChainEvidenceProbeResult>;

/** Class/static method with empty arguments and captured result. */
export declare function probeCaptureStatic(): Promise<ChainEvidenceProbeResult>;

/** Main-thread methods/logs, log-only capture and two named native workers. */
export declare function probeThreadNames(): Promise<ChainEvidenceProbeResult>;

/** Default depth five, custom depths, disabled stacks and composition with existing capture. */
export declare function probeCaptureStackOptions(): Promise<ChainEvidenceProbeResult>;

/** Invalid stack configuration rollback and clean reinstallation. */
export declare function probeCaptureStackConfig(): Promise<ChainEvidenceProbeResult>;

/** Nested stacks, filtering and asynchronous cleanup. */
export declare function probeCaptureStackLifecycle(): Promise<ChainEvidenceProbeResult>;
