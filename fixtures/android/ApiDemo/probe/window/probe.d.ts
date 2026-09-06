export interface WindowProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Verify getRootViews exposes the focused Activity root. */
export declare function probeActivityRoot(): Promise<WindowProbeResult>;
/** Open a Dialog and verify its focused Window root appears. */
export declare function probeDialogRoot(): Promise<WindowProbeResult>;
/** Open a focusable PopupWindow and verify it becomes the focused root. */
export declare function probeFocusablePopupRoot(): Promise<WindowProbeResult>;
/** Open a non-focusable PopupWindow and verify the Activity stays the query root. */
export declare function probeNonFocusablePopupRoot(): Promise<WindowProbeResult>;
/** Move the task to background and wait until no App Window root has focus. */
export declare function probeNoFocusedWindow(): Promise<WindowProbeResult>;
