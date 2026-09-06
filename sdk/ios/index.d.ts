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

  interface IOSMethodHook {
    /** Objective-C class name or class wrapper. */
    target: string | ObjCBridge.Object;
    /** Exact Objective-C instance or class selector, including its '- ' or '+ ' prefix. */
    selector: `- ${string}` | `+ ${string}`;
    /** Keep evidence only when this synchronous, read-only callback returns true. */
    filter?: (invocation: IOSMethodHookInvocation) => boolean;
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
