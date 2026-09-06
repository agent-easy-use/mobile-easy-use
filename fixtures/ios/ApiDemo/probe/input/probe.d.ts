export interface InputProbeResult { passed: boolean; api: string; result: unknown; oracle: unknown; navigation?: { returnedToMain: boolean } }
/** Click a UIControl by accessibility identifier and verify its native action oracle. */
export declare function probeClickByIdentifier(): Promise<InputProbeResult>;
/** Click a UIControl through identifier and label descendant path steps. */
export declare function probeClickByPath(): Promise<InputProbeResult>;
/** Resolve a native UIView in the target process and click its screen center through XCTest. */
export declare function probeClickByUIView(): Promise<InputProbeResult>;
/** Click an absolute screen coordinate through XCTest. */
export declare function probeClickByCoordinates(): Promise<InputProbeResult>;
/** Activate a non-UIControl through accessibilityActivate. */
export declare function probeAccessibilityActivation(): Promise<InputProbeResult>;
/** Insert text through UIKeyInput and verify editingChanged state. */
export declare function probeTextInput(text: string): Promise<InputProbeResult>;
/** Scroll a fixed vertical UIScrollView and verify contentOffset. */
export declare function probeVerticalScroll(): Promise<InputProbeResult>;
/** Scroll a fixed horizontal UIScrollView and verify contentOffset. */
export declare function probeHorizontalScroll(): Promise<InputProbeResult>;
/** Verify structured SDK and XCTest failures for invalid targets and arguments. */
export declare function probeTargetErrors(): Promise<InputProbeResult>;
/** Send a real XCTest long press to a generic target. */
export declare function probeLongPress(): Promise<InputProbeResult>;
