export interface ChainEvidenceProbeResult { passed: boolean; api: string; evidenceContract: 'chain-method-log-v2'; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Capture one exact Objective-C method plus static and dynamic NSLog TAGs without changing behavior. */
export declare function probeMethodAndLogChain(): Promise<ChainEvidenceProbeResult>;
