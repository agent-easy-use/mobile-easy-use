export interface StateEvidenceProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Capture clickCount before and after one SDK click action. */
export declare function probeClickStateEvidence(): Promise<StateEvidenceProbeResult>;
