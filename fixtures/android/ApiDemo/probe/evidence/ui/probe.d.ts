export interface UiEvidenceProbeResult {
  passed: boolean;
  api: string;
  evidenceContract: 'ui-visibility-v4';
  result: unknown;
  oracle: unknown;
}

/** Capture the hidden fixture before and after it becomes visible. */
export declare function probeVisibilityUiEvidence(): Promise<UiEvidenceProbeResult>;
