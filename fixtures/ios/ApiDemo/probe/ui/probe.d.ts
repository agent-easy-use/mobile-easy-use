export interface UiProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Find a UIKit view through identifier shorthand. */
export declare function probeFindByIdentifier(): Promise<UiProbeResult>;
/** Resolve a nested native descendant path without escaping the parent subtree. */
export declare function probeFindByPath(): Promise<UiProbeResult>;
/** Return null for an absent native UI target. */
export declare function probeMissingView(): Promise<UiProbeResult>;
/** Find a hidden view while preserving its hidden state. */
export declare function probeFindHiddenView(): Promise<UiProbeResult>;
