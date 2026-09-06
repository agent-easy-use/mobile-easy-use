export interface InputProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle: unknown;
}

/** Click the fixture through the resource-ID overload. */
export declare function probeClickById(): Promise<InputProbeResult>;
/** Click the fixture through the native UI-path overload. */
export declare function probeClickByPath(): Promise<InputProbeResult>;
/** Click an already-resolved concrete View wrapper. */
export declare function probeClickByView(): Promise<InputProbeResult>;
/** Click the center of the location pad through physical screen coordinates. */
export declare function probeClickByLocation(): Promise<InputProbeResult>;
/** Long-press through the resource-ID overload. */
export declare function probeLongPress(): Promise<InputProbeResult>;
/** Long-press through the UI-path overload. */
export declare function probeLongPressByPath(): Promise<InputProbeResult>;
/** Long-press through an already-resolved View wrapper. */
export declare function probeLongPressByView(): Promise<InputProbeResult>;
/** Long-press through physical screen coordinates. */
export declare function probeLongPressByLocation(): Promise<InputProbeResult>;
/** Input representable ASCII text through the resource-ID overload. */
export declare function probeTextInput(text: string): Promise<InputProbeResult>;
/** Input representable ASCII text through the UI-path overload. */
export declare function probeTextInputByPath(text: string): Promise<InputProbeResult>;
/** Input representable ASCII text through an already-resolved View wrapper. */
export declare function probeTextInputByView(text: string): Promise<InputProbeResult>;
/** Input representable ASCII text through physical screen coordinates. */
export declare function probeTextInputByLocation(text: string): Promise<InputProbeResult>;
/** Scroll upward through the resource-ID overload. */
export declare function probeVerticalScroll(): Promise<InputProbeResult>;
/** Scroll upward through the UI-path overload. */
export declare function probeVerticalScrollByPath(): Promise<InputProbeResult>;
/** Scroll upward through an already-resolved View wrapper. */
export declare function probeVerticalScrollByView(): Promise<InputProbeResult>;
/** Scroll upward through physical screen coordinates. */
export declare function probeVerticalScrollByLocation(): Promise<InputProbeResult>;
/** Inject a leftward finger gesture and verify horizontal content offset changes. */
export declare function probeHorizontalScroll(): Promise<InputProbeResult>;
/** Verify structured failures for hidden, zero-size, detached and invalid-coordinate targets. */
export declare function probeTargetErrors(): Promise<InputProbeResult>;
