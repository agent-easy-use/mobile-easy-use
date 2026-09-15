export interface UiProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
  evidenceContract?: 'class-ui-v1';
}

/** Find a View through the positive integer resource-ID overload. */
export declare function probeFindByResourceId(): Promise<UiProbeResult>;
/** Find descendant Views through exact id, text and tag path steps. */
export declare function probeFindByPath(): Promise<UiProbeResult>;
/** Find a View with a getter path and verify the concrete runtime wrapper. */
export declare function probeFindByGetter(): Promise<UiProbeResult>;
/** Verify a valid path with no match returns null. */
export declare function probeMissingView(): Promise<UiProbeResult>;
/** Verify find returns an attached INVISIBLE View without claiming it is shown. */
export declare function probeFindHiddenView(): Promise<UiProbeResult>;
/** Verify a custom View is promoted to its concrete runtime wrapper. */
export declare function probeRuntimeWrapper(): Promise<UiProbeResult>;
/** Real class lookup: exact type, subclasses, DFS order and mixed path steps. */
export declare function probeFindByClass(): Promise<UiProbeResult>;
/** Scope, no backtracking, class-name misses, empty names and hidden Views. */
export declare function probeClassPathBoundaries(): Promise<UiProbeResult>;
/** Real click, independent native state, screenshot crops and class-ui-v1 evidence. */
export declare function probeClassActions(): Promise<UiProbeResult>;
