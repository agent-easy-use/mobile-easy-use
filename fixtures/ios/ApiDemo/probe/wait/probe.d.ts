export interface WaitProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Wait for an already attached UIKit view to exist. */
export declare function probeImmediateExist(): Promise<WaitProbeResult>;
/** Schedule a hidden view to become visible, then poll native UI state. */
export declare function probeDelayedVisible(): Promise<WaitProbeResult>;
/** Schedule a visible view to become hidden, then wait for hidden. */
export declare function probeDelayedGone(): Promise<WaitProbeResult>;
/** Schedule a detached view to enter the hierarchy and wait for exist. */
export declare function probeDelayedAttach(): Promise<WaitProbeResult>;
/** Schedule detach and use wait.until to check that the target no longer exists. */
export declare function probeDelayedDetach(): Promise<WaitProbeResult>;
/** Schedule a zero-size view to receive bounds and wait for visible. */
export declare function probeDelayedResize(): Promise<WaitProbeResult>;
/** Verify an unsatisfied native UI condition returns TIMEOUT. */
export declare function probeTimeout(): Promise<WaitProbeResult>;
/** Verify wait.until polls a boolean predicate. */
export declare function probeUntil(): Promise<WaitProbeResult>;
