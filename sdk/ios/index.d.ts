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

  interface IOSOverrideApi {
    /** Install method overrides for the action and restore them after its return or Promise settlement. */
    run<TResult, TValue extends IOSOverrideReturnValue = IOSOverrideReturnValue>(
      definitions: readonly IOSOverrideDefinition<TValue>[],
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
    /** Synchronous read-only entry extraction; finite, acyclic plain JSON only, no runtime wrappers. */
    args?: (invocation: IOSChainArgsInvocation) => IOSJsonValue;
    /** Synchronous, read-only JSON extraction on normal return only; same JSON restrictions as args.
     * Same scalar decoding as args; void is undefined (omit extraction or explicitly return JSON null).
     * Float/double/aggregate returns are unsupported. Receiver/entry args are not retained.
     */
    result?: (invocation: { className: string; selector: string;
      result: NativePointer | number | boolean | string | undefined }) => IOSJsonValue;
    /** Default false. Emits elapsedMs as a number with fractional milliseconds, using CLOCK_UPTIME_RAW.
     * Includes children/waits, excludes sleep.
     * Requires arm64/x64. Not CPU time or async completion time.
     */
    timing?: boolean;
    /** Default off. arm64/x64 task_info TASK_VM_INFO phys_footprint, in bytes, before/after only.
     * No polling/forced collection; process delta includes concurrent activity, not method allocations.
     */
    memory?: {
      /** Non-empty selection; unsupported names are rejected before the action runs. */
      metrics: readonly IOSChainMemoryMetric[];
    };
  }

  interface IOSMethodHook {
    /** Objective-C class name or class wrapper. */
    target: string | ObjCBridge.Object;
    /** Exact Objective-C instance or class selector, including its '- ' or '+ ' prefix. */
    selector: `- ${string}` | `+ ${string}`;
    /** Keep evidence only when this synchronous, read-only callback returns true. */
    filter?: (invocation: IOSMethodHookInvocation) => boolean;
    /** Optional capture: args and args errors on enter; result on leave, with elapsedMs (number, fractional milliseconds),
     * memory[metric] {unit:'bytes',before,after,delta}, captureErrors [{field,message}].
     * Failed memory reads and dependent deltas are null; failed extraction/timing fields are omitted.
     * Omitting capture preserves legacy events. Capture data goes to Evidence, not the action return value.
     * Invalid configuration rejects before the action; runtime capture failures preserve original behavior.
     * No invocation ID or generic ObjC exception capture.
     * Nested hooks affect parent timings. Argument callbacks must not alter observed objects.
     * @example capture: { timing: true, memory: {metrics: ['physicalFootprintBytes']} }
     */
    capture?: IOSChainCapture;
  }

  type IOSStateGetters = Readonly<Record<string, () => IOSJsonValue>>;
  type IOSUiTargets = Readonly<Record<string, string | IOSUiPath>>;

  interface IOSProbeEvidenceApi {
    /**
     * Install a TAG-prefix NSLog capture and observe-only IMP hooks around the action.
     * A matching format may begin with a static `[TAG] ` or dynamic `[%@]` prefix.
     * Dynamic capture requires the first variadic argument to be an NSString equal to TAG.
     * Matching logs retain `[TAG] ` in the message and stream evidence immediately without
     * modifying the original format, arguments, or system log output.
     */
    withChainEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      logTag?: string | Set<string>,
      methodHooks?: readonly IOSMethodHook[],
    ): Promise<Awaited<TResult>>;

    /** Capture synchronous state getters before the action and again in finally. */
    withStateEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      stateGetters: IOSStateGetters,
    ): Promise<Awaited<TResult>>;

    /** Capture UIKit state plus App-window and visible element screenshots before and after. */
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
