export interface StateEvidenceProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Capture clickCount before and after one SDK click action. */
export declare function probeClickStateEvidence(): Promise<StateEvidenceProbeResult>;

export interface StateRuntimeProbeResult {
  passed: boolean;
  api: string;
  evidenceContract: string;
  result: unknown;
  oracle: unknown;
  navigation?: { returnedToMain: boolean };
}
/** Serial sync/async getters, real main-thread reads and action result preservation. */
export declare function probeAsyncStateGetters(): Promise<StateRuntimeProbeResult>;
/** Thrown and rejected getters produce errors at both checkpoints. */
export declare function probeStateGetterErrors(): Promise<StateRuntimeProbeResult>;
/** Per-checkpoint failures preserve the original action rejection and after collection. */
export declare function probeStateFailureIsolation(): Promise<StateRuntimeProbeResult>;
