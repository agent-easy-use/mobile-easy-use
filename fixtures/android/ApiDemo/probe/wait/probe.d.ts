export interface WaitProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Wait for an already attached View to exist. */
export declare function probeImmediateExist(): Promise<WaitProbeResult>;
/** Wait for an already attached View to exist through a UI path. */
export declare function probeImmediateExistByPath(): Promise<WaitProbeResult>;
/** Wait for an already attached resolved View through a getter path to exist. */
export declare function probeImmediateExistByView(): Promise<WaitProbeResult>;
/** Schedule an INVISIBLE View to show, then wait for visible. */
export declare function probeDelayedVisible(): Promise<WaitProbeResult>;
/** Wait through a UI path until an INVISIBLE View becomes visible. */
export declare function probeDelayedVisibleByPath(): Promise<WaitProbeResult>;
/** Wait through a getter path returning a resolved View until it becomes visible. */
export declare function probeDelayedVisibleByView(): Promise<WaitProbeResult>;
/** Schedule a visible View to become GONE, then wait for hidden. */
export declare function probeDelayedGone(): Promise<WaitProbeResult>;
/** Wait through a UI path until a visible View becomes GONE. */
export declare function probeDelayedGoneByPath(): Promise<WaitProbeResult>;
/** Schedule a detached View to attach and wait for resource-ID existence. */
export declare function probeDelayedAttach(): Promise<WaitProbeResult>;
/** Schedule detach and use wait.until to check that the target no longer exists. */
export declare function probeDelayedDetach(): Promise<WaitProbeResult>;
/** Schedule a zero-size View to receive bounds, then wait for visible. */
export declare function probeDelayedResize(): Promise<WaitProbeResult>;
/** Verify an unsatisfied visible wait returns the structured TIMEOUT result. */
export declare function probeTimeout(): Promise<WaitProbeResult>;
/** Verify wait.until polls a boolean predicate. */
export declare function probeUntil(): Promise<WaitProbeResult>;
