export interface ChainEvidenceProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
  evidenceContract?: string;
}

/** Capture two selected native log TAGs while excluding an emitted noise TAG. */
export declare function probeMethodAndLogChain(): Promise<ChainEvidenceProbeResult>;

/** Retained allocation, bounded delay, input/result fields and real memory metrics. */
export declare function probeCaptureSuccess(): Promise<ChainEvidenceProbeResult>;
/** Java throw capture without changing the original exception or executing result extraction. */
export declare function probeCaptureThrow(): Promise<ChainEvidenceProbeResult>;
/** Filtering and legacy behavior when capture is absent. */
export declare function probeCaptureFilterAndDisabled(): Promise<ChainEvidenceProbeResult>;
/** Nested invocation-local capture correctness. */
export declare function probeCaptureRecursive(): Promise<ChainEvidenceProbeResult>;
/** Extractor failures leave original return value and resource capture intact. */
export declare function probeCaptureExtractorErrors(): Promise<ChainEvidenceProbeResult>;
/** Invalid configuration rolls back installed hooks and allows a clean subsequent installation. */
export declare function probeCaptureInvalidConfigCleanup(): Promise<ChainEvidenceProbeResult>;

/** Native boolean, 64-bit precision, null, void and exact overload selection. */
export declare function probeCaptureScalars(): Promise<ChainEvidenceProbeResult>;

/** Each independent option, empty/disabled capture, and immutable JSON snapshots. */
export declare function probeCaptureOptions(): Promise<ChainEvidenceProbeResult>;

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
