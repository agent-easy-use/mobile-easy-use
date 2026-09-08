export interface InputProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
export type InputTargetKind = 'identifier' | 'path' | 'view' | 'coordinates';
/** Click a UIControl by accessibility identifier and verify its native action oracle. */
export declare function probeClickByIdentifier(): Promise<InputProbeResult>;
/** Click a UIControl through identifier and label descendant path steps. */
export declare function probeClickByPath(): Promise<InputProbeResult>;
/** Resolve a native UIView in the target process and click its screen center through XCTest. */
export declare function probeClickByUIView(): Promise<InputProbeResult>;
/** Click an absolute screen coordinate through XCTest. */
export declare function probeClickByCoordinates(): Promise<InputProbeResult>;
/** Verify touchesEnded fires once and accessibilityActivate is never called. */
export declare function probeCustomViewTouch(): Promise<InputProbeResult>;
/** Verify the complete native text value; defaults to identifier targeting. */
export declare function probeTextInput(text: string, targetKind?: InputTargetKind): Promise<InputProbeResult>;
/** Omit distance to test the SDK default of 300 pt; MCP numeric arguments use strings. */
export declare function probeVerticalScroll(targetKind?: InputTargetKind, direction?: 'up' | 'down', distance?: string): Promise<InputProbeResult>;
export declare function probeHorizontalScroll(targetKind?: InputTargetKind, direction?: 'left' | 'right', distance?: string): Promise<InputProbeResult>;
/** Verify structured SDK and XCTest failures for invalid targets and arguments. */
export declare function probeTargetErrors(): Promise<InputProbeResult>;
/** Omit durationMs to test the 600 ms default; pass e.g. "800" for a custom duration. */
export declare function probeLongPress(targetKind?: InputTargetKind, durationMs?: string): Promise<InputProbeResult>;
/** Two real text submissions must preserve prefix- and add Chinese/emoji text. */
export declare function probeTextAppend(targetKind?: InputTargetKind): Promise<InputProbeResult>;
/** View targets use the clipped center; raw coordinates retain their supplied, unclipped center. */
export declare function probeClippedTarget(targetKind?: InputTargetKind): Promise<InputProbeResult>;
/** View targets fail before touching the cover; raw coordinates touch the cover. */
export declare function probeCoveredTarget(targetKind?: InputTargetKind): Promise<InputProbeResult>;
/** Verify first-match selection; the path case also repeats the root as a path step. */
export declare function probeFirstMatch(targetKind?: 'identifier' | 'path'): Promise<InputProbeResult>;
