export interface UiEvidenceProbeResult { passed: boolean; api: string; evidenceContract: 'ui-visibility-v4'; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Capture UIKit properties before and after a hidden target becomes visible. */
export declare function probeVisibilityUiEvidence(): Promise<UiEvidenceProbeResult>;
