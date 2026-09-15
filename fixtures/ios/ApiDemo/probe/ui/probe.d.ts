export interface UiProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; evidenceContract?: 'class-ui-v1'; navigation?: { returnedToMain: boolean } }
/** Find a UIKit view through identifier shorthand. */
export declare function probeFindByIdentifier(): Promise<UiProbeResult>;
/** Resolve a nested native descendant path without escaping the parent subtree. */
export declare function probeFindByPath(): Promise<UiProbeResult>;
/** Return null for an absent native UI target. */
export declare function probeMissingView(): Promise<UiProbeResult>;
/** Find a hidden view while preserving its hidden state. */
export declare function probeFindHiddenView(): Promise<UiProbeResult>;
/** Real class lookup: exact type, subclasses, DFS order and mixed path steps. */
export declare function probeFindByClass(): Promise<UiProbeResult>;
/** Scope, no backtracking, class-name misses, empty names and hidden Views. */
export declare function probeClassPathBoundaries(): Promise<UiProbeResult>;
/** Real click, independent native state, screenshot crops and class-ui-v1 evidence. */
export declare function probeClassActions(): Promise<UiProbeResult>;
