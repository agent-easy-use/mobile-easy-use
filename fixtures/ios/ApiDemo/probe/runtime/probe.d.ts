export interface RuntimeProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Probe runtimeStatus through a reusable callFunction module. */
export declare function probeRuntimeStatus(): Promise<RuntimeProbeResult>;
/** Prove callFunction argument transport and asynchronous return handling. */
export declare function probeCallFunction(value: unknown): Promise<RuntimeProbeResult>;
