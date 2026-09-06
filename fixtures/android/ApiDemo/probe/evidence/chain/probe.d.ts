export interface ChainEvidenceProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Capture two selected native log TAGs while excluding an emitted noise TAG. */
export declare function probeMethodAndLogChain(): Promise<ChainEvidenceProbeResult>;
