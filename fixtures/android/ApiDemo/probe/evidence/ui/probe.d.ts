export interface UiEvidenceProbeResult {
  passed: boolean;
  api: string;
  evidenceContract: 'ui-visibility-v4' | 'ui-state-v1';
  result: unknown;
  oracle: unknown;
}

/** Capture the hidden fixture before and after it becomes visible. */
export declare function probeVisibilityUiEvidence(): Promise<UiEvidenceProbeResult>;

/** Requested UI text read through state getters, aggregated with UI screenshots for one action. */
export declare function probeUiStateEvidence(): Promise<UiEvidenceProbeResult>;
