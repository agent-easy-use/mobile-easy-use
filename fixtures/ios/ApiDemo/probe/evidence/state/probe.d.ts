export interface StateEvidenceProbeResult { passed: boolean; api: string; evidenceContract: 'state-click-v2'; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Capture Objective-C state before and after one semantic click. */
export declare function probeClickStateEvidence(): Promise<StateEvidenceProbeResult>;
