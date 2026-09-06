export interface WaitProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Wait for an already attached UIKit view to exist. */
export declare function probeImmediateExist(): Promise<WaitProbeResult>;
/** Schedule a hidden view to become visible, then poll native UI state. */
export declare function probeDelayedVisible(): Promise<WaitProbeResult>;
/** Schedule a visible view to become hidden, then wait for the current gone contract. */
export declare function probeDelayedGone(): Promise<WaitProbeResult>;
/** Schedule a detached view to enter the hierarchy and wait for exist. */
export declare function probeDelayedAttach(): Promise<WaitProbeResult>;
/** Schedule an attached view to leave the hierarchy and wait for gone. */
export declare function probeDelayedDetach(): Promise<WaitProbeResult>;
/** Schedule a zero-size view to receive bounds and wait for visible. */
export declare function probeDelayedResize(): Promise<WaitProbeResult>;
/** Verify an unsatisfied native UI condition returns TIMEOUT. */
export declare function probeTimeout(): Promise<WaitProbeResult>;
/** Verify wait.until accepts only a synchronous boolean predicate. */
export declare function probeUntil(): Promise<WaitProbeResult>;
