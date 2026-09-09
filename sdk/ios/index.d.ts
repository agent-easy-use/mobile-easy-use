/// <reference types="frida-gum" />

import ObjCBridge from 'frida-objc-bridge';

export {};

/**
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless a method JSDoc states a caller-thread requirement.
 */
declare global {
  const ObjC: typeof ObjCBridge;

  type IOSJsonPrimitive = string | number | boolean | null;
  type IOSJsonValue =
    | IOSJsonPrimitive
    | readonly IOSJsonValue[]
    | { readonly [key: string]: IOSJsonValue };

  type IOSUiPathStep =
    | `identifier::${string}`
    | `label::${string}`;

  type IOSUiPath = readonly [IOSUiPathStep, ...IOSUiPathStep[]];

  interface IOSUiApi {
    /** Find a UIView by accessibility identifier below the native focused window. */
    find(accessibilityIdentifier: string): ObjCBridge.Object | null;
    /** Resolve native identifier/label steps below the preceding UIView. */
    find(path: IOSUiPath): ObjCBridge.Object | null;
  }

  type IOSScreenshotTarget = string | IOSUiPath;

  interface IOSScreenshotOptions {
    /** Optional keyed elements cropped from the captured App Window. */
    targets?: Readonly<Record<string, IOSScreenshotTarget>>;
    /** Also return the App Window when targets are provided. Defaults to false. */
    includeWindow?: boolean;
  }

  type IOSScreenshotResult =
    /** Successful values are Host image paths. */
    | { ok: true; window?: string; targets: Readonly<Record<string, string>> }
    | { ok: false; error: { message: string }; targets: {} };

  type IOSInputDirection = 'up' | 'down' | 'left' | 'right';
  /** Input path and coordinate targets are resolved by the independent XCTest Driver. */
  interface IOSScreenLocation {
    /** Absolute XCTest screen coordinate in points. */
    x: number;
    /** Absolute XCTest screen coordinate in points. */
    y: number;
  }

  type IOSInputTarget = string | IOSUiPath | ObjCBridge.Object | IOSScreenLocation;

  interface IOSInputSuccess {
    ok: true;
    action: 'click' | 'input' | 'scroll' | 'longPress';
    mode: 'semantic';
    textLength?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    distance?: number;
    direction?: IOSInputDirection;
  }

  interface IOSInputFailure {
    ok: false;
    action: 'click' | 'input' | 'scroll' | 'longPress';
    mode: 'semantic';
    error: {
      code: string;
      message: string;
    };
  }

  type IOSInputResult = IOSInputSuccess | IOSInputFailure;

  interface IOSInputApi {
    /** Perform a real XCTest tap, then wait 1000 ms before resolving. */
    click(target: IOSInputTarget): Promise<IOSInputResult>;
    /** Focus and type through XCTest, then wait 1000 ms before resolving. */
    input(target: IOSInputTarget, text: string): Promise<IOSInputResult>;
    /** Perform a real XCTest drag gesture, then wait 1000 ms before resolving. */
    scroll(
      target: IOSInputTarget,
      direction: IOSInputDirection,
      distance?: number,
    ): Promise<IOSInputResult>;
    /** Perform a real XCTest long press, then wait 1000 ms before resolving. */
    longPress(
      target: IOSInputTarget,
      durationMs?: number,
    ): Promise<IOSInputResult>;
  }

  interface IOSWaitOptions {
    timeoutMs?: number;
    intervalMs?: number;
  }

  type IOSUiWaitState = 'exist' | 'visible' | 'gone';
  type IOSWaitErrorCode = 'TIMEOUT' | 'INVALID_ARGUMENT';

  interface IOSWaitSuccess {
    ok: true;
  }

  interface IOSWaitFailure {
    ok: false;
    error: {
      code: IOSWaitErrorCode;
      message: string;
      lastCheckError?: string;
    };
  }

  type IOSWaitResult = IOSWaitSuccess | IOSWaitFailure;

  interface IOSWaitApi {
    ui(
      target: string | IOSUiPath,
      state: IOSUiWaitState,
      options?: IOSWaitOptions,
    ): Promise<IOSWaitResult>;
    /** The predicate must synchronously return a boolean. */
    until(predicate: () => boolean, options?: IOSWaitOptions): Promise<IOSWaitResult>;
  }

  interface IOSApi {
    /** Run work on the iOS main queue and resolve with its result. */
    runOnMainThread<TResult>(work: () => TResult | Promise<TResult>): Promise<TResult>;
    /** Capture the focused App Window, keyed element crops, or both. */
    screenshot(options?: IOSScreenshotOptions): Promise<IOSScreenshotResult>;
    readonly ui: IOSUiApi;
    readonly input: IOSInputApi;
    readonly wait: IOSWaitApi;
  }

  interface IOSOverrideInvocation {
    receiver: ObjCBridge.Object;
    args: readonly unknown[];
    className: string;
    selector: `- ${string}` | `+ ${string}`;
  }

  type IOSOverrideReturnValue =
    | IOSJsonValue
    | ObjCBridge.Object
    | NativePointer
    | undefined;

  interface IOSOverrideDefinition<
    TValue extends IOSOverrideReturnValue = IOSOverrideReturnValue,
  > {
    /** Objective-C class name or class wrapper. */
    target: string | ObjCBridge.Object;
    /** Exact Objective-C instance or class selector, including its '- ' or '+ ' prefix. */
    selector: `- ${string}` | `+ ${string}`;
    /** Apply withReturn only when this synchronous, read-only callback returns true. */
    filter?: (invocation: IOSOverrideInvocation) => boolean;
    /** Replacement result or synchronous replacement-result factory. The original method is skipped. */
    withReturn: TValue | ((invocation: IOSOverrideInvocation) => TValue);
  }

  type IOSOverrideFieldValue = boolean | number | Int64 | UInt64 | ObjCBridge.Object | null;

  /**
   * Write once before action and restore the original value afterward; App writes are not blocked.
   * Use stable configuration or flow-control fields. Avoid fields the App changes during action:
   * restoration overwrites those changes. Do not overlap operations on the same field.
   * Replacement objects are held through action. Originals preserve strong/weak ownership;
   * an original weak object released during action is restored as nil. Unknown/unretained ownership is unsupported.
   * Object ivars require the runtime ownership SPI; unavailable runtimes fail before action.
   * Field access uses the runtime thread; fields requiring a specific App thread are unsupported.
   */
  interface IOSOverrideFieldDefinition {
    /** Objective-C instance; boolean, numeric and managed object ivars. No properties, blocks or pure Swift fields. */
    target: ObjCBridge.Object;
    /** Exact runtime ivar name. */
    field: string;
    /** Native-compatible fixed value. Construct NSString/NSNumber explicitly; no automatic object wrapping. */
    withValue: IOSOverrideFieldValue;
  }

  interface IOSOverrideApi {
    /**
     * Install methods or write fields before action; restore in reverse order after return, throw or Promise settlement.
     * Installation failure rolls back earlier definitions without running action.
     * @param definitions Method and field definitions, optionally mixed.
     * @param action Trigger and required completion wait; return or await all dependent asynchronous work.
     * @returns The action result or Promise, preserving its outcome.
     */
    run<TResult, TValue extends IOSOverrideReturnValue = IOSOverrideReturnValue>(
      definitions: readonly (IOSOverrideDefinition<TValue> | IOSOverrideFieldDefinition)[],
      action: () => TResult,
    ): TResult extends Promise<infer TResolved> ? Promise<TResolved> : TResult;
  }

  interface IOSMethodHookInvocation {
    receiver: ObjCBridge.Object;
    className: string;
    selector: string;
  }

  type IOSChainMemoryMetric = 'physicalFootprintBytes';
  /** Pointer/object/selector arguments remain NativePointer; convert known objects with ObjC.Object.
   * Integer <=32-bit values are numbers, BOOL is boolean, 64-bit integers are decimal strings.
   * Float/double/aggregate argument signatures are unsupported and report captureErrors.
   */
  interface IOSChainArgsInvocation extends IOSMethodHookInvocation {
    /** Explicit method arguments only; excludes self and _cmd. */
    readonly args: readonly (NativePointer | number | boolean | string)[];
  }

  interface IOSChainCapture {
    /** Default off. true or {} captures the entry stack with at most 5 frames.
     * maxFrames must be an integer from 1 to 16; actual stacks may be shorter.
     * Emits capture.stack {kind: 'native', frames: [...]} on enter only.
     * Native frames contain address, moduleName, name, fileName and lineNumber; symbols may be null.
     * @example stack: true // or stack: {maxFrames: 3}
     */
    stack?: boolean | { maxFrames?: number };
    /** Synchronous read-only entry extraction; returns data serialized as JSON. */
    args?: (invocation: IOSChainArgsInvocation) => IOSJsonValue;
    /** Synchronous, read-only JSON extraction on normal return only.
     * Same scalar decoding as args; void is undefined (omit extraction or explicitly return JSON null).
     * Float/double/aggregate returns are unsupported. Receiver/entry args are not retained.
     */
    result?: (invocation: { className: string; selector: string;
      result: NativePointer | number | boolean | string | undefined }) => IOSJsonValue;
    /** Default off. Emits elapsedMs in fractional milliseconds, measured with a monotonic clock.
     * Includes children/waits, excludes sleep.
     * Requires arm64/x64. Not CPU time or async completion time.
     */
    timing?: boolean;
    /** Default off. Read process physical footprint in bytes before/after; requires arm64/x64.
     * No polling/forced collection; process delta includes concurrent activity, not method allocations.
     */
    memory?: {
      /** Non-empty selection; unsupported names are rejected before the action runs. */
      metrics: readonly IOSChainMemoryMetric[];
    };
  }

  interface IOSMethodHook {
    /** Objective-C class name or class wrapper. Matches that class and subclasses using this IMP;
     * subclass overrides at other addresses require separate hooks. Events use the configured className.
     */
    target: string | ObjCBridge.Object;
    /** Exact Objective-C instance or class selector, including its '- ' or '+ ' prefix. */
    selector: `- ${string}` | `+ ${string}`;
    /** Keep evidence only when this synchronous, read-only callback returns true. */
    filter?: (invocation: IOSMethodHookInvocation) => boolean;
    /** Optional method data: args/stack on enter; result/timing/memory on leave. No generic Objective-C throw capture.
     * Writes to Evidence; the action result is unchanged. Omit to record execution only.
     * Invalid configuration rejects before the action. Collection failures preserve business behavior
     * and emit captureErrors [{field,message}]; failed fields are omitted, failed memory readings/deltas are null.
     * Memory output: memory[metric] {unit:'bytes',before,after,delta}.
     * Nested probes add overhead to parent timings; keep capture selective.
     * @example capture: { stack: true, timing: true }
     */
    capture?: IOSChainCapture;
  }

  type IOSStateGetters = Readonly<Record<string, () => IOSJsonValue | Promise<IOSJsonValue>>>;
  type IOSUiTargets = Readonly<Record<string, string | IOSUiPath>>;

  interface IOSProbeEvidenceApi {
    /** Capture selected Objective-C methods and TAG-prefixed NSLog messages during action.
     * Await action and remove hooks on completion or failure; return its result or propagate its error.
     * Records are written to Evidence. Method/log events include threadName (null when unavailable).
     * Supports multiple TAGs per call.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     * @param logTag Exact TAG or TAG set; matches `[TAG] ` or `[%@]` with TAG as the first NSString argument.
     * @param methodHooks Methods to observe; omit for log-only capture.
     * @example await Probe.evidence.withChainEvidence(action, 'Submit search', 'Search', methodHooks);
     */
    withChainEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      logTag?: string | Set<string>,
      methodHooks?: readonly IOSMethodHook[],
    ): Promise<Awaited<TResult>>;

    /** Await state getters sequentially before action and again in finally.
     * Getter results are serialized as JSON; dispatch to the required thread
     * inside the getter. Bound external waits; getters that never settle block the checkpoint.
     * Evidence entries contain path and successful before/after values (including null).
     * Getter failures omit the checkpoint value and set errors.before/after; action results/errors are preserved.
     * Multiple getters are not an atomic snapshot; read related fields together in one getter.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     */
    withStateEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      stateGetters: IOSStateGetters,
    ): Promise<Awaited<TResult>>;

    /** Capture UIKit state plus App-window and visible element screenshots before and after.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     */
    withUiEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      uiTargets: IOSUiTargets,
    ): Promise<Awaited<TResult>>;
  }

  interface IOSProbeApi {
    readonly evidence: IOSProbeEvidenceApi;
  }

  const IOS: Readonly<IOSApi>;
  /** Action-scoped Objective-C method return overrides. */
  const Override: Readonly<IOSOverrideApi>;
  const Probe: Readonly<IOSProbeApi>;
}
