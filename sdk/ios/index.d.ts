/// <reference types="frida-gum" />

import ObjCBridge from 'frida-objc-bridge';

export {};

/**
 * Canonical API contract for generating iOS probe scripts. Load the built ios.js in Bootstrap,
 * then use ObjC, IOS, Override, Probe, and runtimeStatus as globals; do not import this file at runtime.
 * Load only this platform declaration; Android and iOS globals belong to separate runtimes.
 * Probe modules should export functions and perform actions when called, not at module load.
 * Await asynchronous SDK calls and check result.ok before relying on an action or wait.
 * Return JSON-serializable values to the Host; convert ObjC objects and NativePointers first.
 *
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless a method JSDoc states a caller-thread requirement.
 */
declare global {
  // The ObjC global namespace is supplied by the frida-gum reference above.
  // The SDK binds it to frida-objc-bridge; UIKit calls retain their own thread requirements.

  interface IOSRuntimeStatus {
    platform: 'ios';
    /** Objective-C availability only; does not guarantee native bridge or XCTest Driver readiness. */
    available: boolean;
    appId: string | null;
    /** Native MobileEasyUse version, or null when its symbol/runtime is unavailable. */
    releaseVersion: string | null;
  }

  /** Read target-process runtime metadata synchronously; does not query the independent XCTest Driver.
   * @example const status = runtimeStatus();
   */
  function runtimeStatus(): IOSRuntimeStatus;

  type IOSJsonPrimitive = string | number | boolean | null;
  type IOSJsonValue =
    | IOSJsonPrimitive
    | readonly IOSJsonValue[]
    | { readonly [key: string]: IOSJsonValue };

  /** Non-empty identifier/label value, matched exactly and case-sensitively. No JS getters or text:: steps. */
  type IOSUiPathStep =
    | `identifier::${string}`
    | `label::${string}`;

  /** Non-empty path. ui.find/wait/screenshot/evidence/input share the native UIView query.
   * Each step selects the first match in the preceding subtree, including its root; no backtracking.
   */
  type IOSUiPath = readonly [IOSUiPathStep, ...IOSUiPathStep[]];

  /** Native MEUUIQuery synchronously dispatches queries to main. Searches the first key window,
   * falling back to the first non-hidden window with alpha > 0.01. Each step includes the current
   * root, then depth-first descendants (subviews order), visiting at most 10,000 Views per step.
   * Matches need not be visible. Only UIViews are searched; virtual accessibility/SwiftUI elements
   * may have no corresponding UIView. Invalid targets or an unavailable native bridge throw.
   */
  interface IOSUiApi {
    /** Find the first UIView matching a non-empty accessibilityIdentifier. Returns null on no match/window.
     * A plain string is always an identifier, even if it contains ::. Raw methods on the returned ObjC
     * object retain UIKit thread requirements; use IOS.runOnMainThread for subsequent UI access.
     * @example const view = IOS.ui.find('search.submit');
     */
    find(accessibilityIdentifier: string): ObjCBridge.Object | null;
    /** Resolve each step in the preceding UIView subtree (including that View). Returns null on any miss.
     * @example const view = IOS.ui.find(['identifier::search.form', 'label::Submit']);
     */
    find(path: IOSUiPath): ObjCBridge.Object | null;
  }

  type IOSScreenshotTarget = string | IOSUiPath;

  interface IOSScreenshotOptions {
    /** Optional non-empty keys mapped to elements cropped from the captured App Window. UIView objects are not accepted. */
    targets?: Readonly<Record<string, IOSScreenshotTarget>>;
    /** Defaults to false with non-empty targets. An absent/empty target map always captures the window. */
    includeWindow?: boolean;
  }

  type IOSScreenshotResult =
    /** Successful values are Host JPEG paths. Unresolved/non-croppable targets are omitted, even when ok is true. */
    | { ok: true; window?: string; targets: Readonly<Partial<Record<string, string>>> }
    | { ok: false; error: { message: string }; targets: Readonly<Partial<Record<string, never>>> };

  /** Direction of finger movement; content normally moves in the opposite direction. */
  type IOSInputDirection = 'up' | 'down' | 'left' | 'right';
  /** Validated in the target App, then dispatched as screen points to the XCTest Runner. */
  interface IOSScreenLocation {
    /** Absolute main-screen coordinate in the current interface orientation, in points (not pixels).
     * Must be finite and inside the foreground UIWindowScene's key window visible bounds.
     */
    x: number;
    /** Same coordinate space and bounds requirements as x. */
    y: number;
  }

  /** Identifier/path targets resolve with ui.find in the target App, using first-match UIView
   * semantics (no ambiguity error). Lookup, clipping and hit-testing run in one App main-queue turn.
   * A missing UIView fails; a hidden, detached or non-interactive target also fails.
   * The actual touch-down point must hit the target or a descendant through the App's
   * front-to-back window order in the target scene, including equal-level windows.
   * Pass-through windows are skipped. This precheck excludes other processes' system windows
   * and does not track changes after resolution. Raw coordinates do not require a target hit.
   * Only the clipped visible screen center/bounds and gesture endpoints reach the Runner;
   * no XCTest element query is used. Requires a foreground UIWindowScene on the main screen.
   * Virtual accessibility elements without a UIView are not addressable by identifier/path;
   * use known coordinates.
   * Only UIView instances are accepted from ObjCBridge.Object; arbitrary ObjC objects are invalid.
   */
  type IOSInputTarget = string | IOSUiPath | ObjCBridge.Object | IOSScreenLocation;
  type IOSInputAction = 'click' | 'input' | 'scroll' | 'longPress';

  interface IOSClickSuccess {
    ok: true;
    action: 'click';
    mode: 'semantic';
  }

  interface IOSTargetInputSuccess {
    ok: true;
    action: 'input';
    mode: 'semantic';
    /** JavaScript string length (UTF-16 code units). */
    textLength: number;
  }

  interface IOSScrollSuccess {
    ok: true;
    action: 'scroll';
    mode: 'semantic';
    /** Actual clamped gesture endpoints in screen points. */
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    /** Requested distance in points; actual travel may be shorter after clamping. */
    distance: number;
    direction: IOSInputDirection;
  }

  interface IOSLongPressSuccess {
    ok: true;
    action: 'longPress';
    mode: 'semantic';
  }

  type IOSInputSuccess = IOSClickSuccess | IOSTargetInputSuccess | IOSScrollSuccess | IOSLongPressSuccess;

  interface IOSInputFailure<TAction extends IOSInputAction = IOSInputAction> {
    ok: false;
    action: TAction;
    mode: 'semantic';
    error: {
      /** Open set from SDK/Host/Driver, e.g. INVALID_ARGUMENT, INVALID_TARGET, INVALID_COORDINATES,
       * ELEMENT_NOT_FOUND, TOUCH_TARGET_MISMATCH, NO_TOUCH_RECEIVER, VIEW_NOT_VISIBLE,
       * TARGET_NOT_FOREGROUND, BACKEND_UNAVAILABLE, UNSUPPORTED_SYNTHESIS, INPUT_TIMEOUT,
       * SYNTHESIS_FAILED, SYNTHESIS_UNCERTAIN, or DRIVER_ERROR.
       */
      code: string;
      /** Touch-target errors identify the requested UIView and screen point; mismatches also
       * identify the hit UIView and whether it belongs to another App window.
       */
      message: string;
    };
  }

  type IOSClickResult = IOSClickSuccess | IOSInputFailure<'click'>;
  type IOSTargetInputResult = IOSTargetInputSuccess | IOSInputFailure<'input'>;
  type IOSScrollResult = IOSScrollSuccess | IOSInputFailure<'scroll'>;
  type IOSLongPressResult = IOSLongPressSuccess | IOSInputFailure<'longPress'>;
  type IOSInputResult = IOSInputSuccess | IOSInputFailure;

  /** Requires a connected Host and independent XCTest Driver with the target App in foreground.
   * Resolved responses (including ok:false) wait an additional 1000 ms; thrown transport/setup
   * errors reject without that delay. Success reports action completion, not business readiness.
   * The 30000 ms operation budget includes App target resolution and Host/Runner requests;
   * the internal event deadline reserves 1000 ms for the response. Await a UI/business condition
   * when needed. Resolved coordinates are not tracked if the view moves before dispatch.
   * iOS 18/26: actions use native synthesized touch/text events. On SYNTHESIS_UNCERTAIN,
   * completion is unknown: do not retry automatically; restart the Runner and inspect the UI.
   */
  interface IOSInputApi {
    /** Resolve the target in the App and synthesize a real touch at its screen point.
     * @example const result = await IOS.input.click('search.submit');
     */
    click(target: IOSInputTarget): Promise<IOSClickResult>;
    /** Tap to focus, then synthesize a non-empty text input; existing contents are not cleared.
     * Tap completion does not verify keyboard focus or the resulting text.
     * @example const result = await IOS.input.input('search.query', 'hello');
     */
    input(target: IOSInputTarget, text: string): Promise<IOSTargetInputResult>;
    /** Compute endpoints in the App and drag in the finger direction, clamped to visible target
     * bounds (App bounds for a raw coordinate). Completion does not wait for scrolling inertia.
     * @param distance Positive finite distance in points; defaults to 300, may be clamped.
     * @example const result = await IOS.input.scroll('search.results', 'up', 300);
     */
    scroll(target: IOSInputTarget, direction: IOSInputDirection, distance?: number): Promise<IOSScrollResult>;
    /** Resolve the target in the App and synthesize a real touch held for the requested duration.
     * @param durationMs Positive finite duration in milliseconds; defaults to 600.
     * @example const result = await IOS.input.longPress({ x: 120, y: 360 }, 800);
     */
    longPress(target: IOSInputTarget, durationMs?: number): Promise<IOSLongPressResult>;
  }

  interface IOSWaitOptions {
    /** Positive finite timeout in milliseconds, default 5000. Cannot preempt a blocked check. */
    timeoutMs?: number;
    /** Positive finite delay between checks in milliseconds, default 100. First check is immediate. */
    intervalMs?: number;
  }

  /** exist: a UIView matches. visible: attached to a window, non-hidden including ancestors,
   * cumulative alpha > 0.01, and positive bounds. gone: absent or not visible, including no window.
   * Visibility does not test screen intersection, occlusion, or XCTest hittability.
   */
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
    /** Re-resolve a native UIView target each check; native bridge owns main-queue dispatch.
     * Resolves ok:false for invalid arguments or timeout; check exceptions are retried and reported
     * as lastCheckError on timeout. Success contains no View. Does not accept UIView objects.
     * @example const ready = await IOS.wait.ui('search.results', 'visible', { timeoutMs: 10000 });
     */
    ui(
      target: string | IOSUiPath,
      state: IOSUiWaitState,
      options?: IOSWaitOptions,
    ): Promise<IOSWaitResult>;
    /** Poll a synchronous boolean predicate without main-queue dispatch. Async predicates are invalid.
     * Throwing checks are retried; timeout includes lastCheckError. Returns ok:false on timeout or
     * invalid arguments. Use wait.ui for native UI visibility checks.
     * @example const ready = await IOS.wait.until(() => cacheReady, { timeoutMs: 10000 });
     */
    until(predicate: () => boolean, options?: IOSWaitOptions): Promise<IOSWaitResult>;
  }

  interface IOSApi {
    /** Schedule work on the iOS main queue. Only the synchronous part before the first await
     * is guaranteed to run there; a returned Promise is adopted, not kept on the main queue.
     * Callback errors reject; unavailable ObjC throws synchronously. Never block waiting for this Promise.
     * @example const label = await IOS.runOnMainThread(() => IOS.ui.find('search.submit')?.accessibilityLabel()?.toString() ?? null);
     */
    runOnMainThread<TResult>(work: () => TResult | Promise<TResult>): Promise<TResult>;
    /** Capture the focused App Window, keyed element crops, or both, using the native UIView query.
     * Requires MEUScreenshot and Host file controller; image values are saved Host JPEG paths.
     * Missing/hidden/out-of-window targets can be omitted on success; check each requested key.
     * Invalid options, failed/incomplete capture, and persistence errors resolve ok:false.
     * @example const shot = await IOS.screenshot({ targets: { submit: 'search.submit' }, includeWindow: true });
     */
    screenshot(options?: IOSScreenshotOptions): Promise<IOSScreenshotResult>;
    readonly ui: IOSUiApi;
    readonly input: IOSInputApi;
    readonly wait: IOSWaitApi;
  }

  interface IOSOverrideInvocation {
    receiver: ObjCBridge.Object;
    /** Raw NativeCallback arguments excluding self/_cmd: pointers for objects/selectors,
     * native numbers/Int64/UInt64/struct arrays according to ABI. No automatic ObjC object conversion.
     */
    args: readonly NativeCallbackArgumentValue[];
    className: string;
    selector: `- ${string}` | `+ ${string}`;
  }

  /** Raw NativeCallback ABI return value matching the selected method. BOOL accepts boolean
   * (converted to 0/1). Object returns require an ObjC object/handle or NULL; plain JS strings,
   * null, and JSON objects are not bridged. Use NSString for text, Int64/UInt64 for exact 64-bit values,
   * ABI-shaped arrays for structs, and undefined for void. Keep returned native objects alive as needed.
   */
  type IOSOverrideReturnValue = NativeCallbackReturnValue | boolean;

  interface IOSOverrideDefinition<
    TValue extends IOSOverrideReturnValue = IOSOverrideReturnValue,
  > {
    /** Objective-C class name or class wrapper. */
    target: string | ObjCBridge.Object;
    /** Exact Objective-C instance or class selector, including its '- ' or '+ ' prefix. */
    selector: `- ${string}` | `+ ${string}`;
    /** Runs on the intercepted thread; only literal true applies withReturn.
     * False or a thrown error calls the original; thrown errors are reported. Must be synchronous/read-only.
     */
    filter?: (invocation: IOSOverrideInvocation) => boolean;
    /** Replacement result or synchronous factory on the intercepted thread; skips the original on success.
     * Factory errors are reported and fall back to the original; ABI conversion errors are outside that
     * fallback. No Promise factories, automatic JSON bridging, or Objective-C exception recovery.
     */
    withReturn: TValue | ((invocation: IOSOverrideInvocation) => TValue);
  }

  interface IOSOverrideApi {
    /** Install a non-empty definition list, call action, and restore after synchronous return/throw or
     * settlement of a native JS Promise. Custom thenables do not extend the scope; use async action.
     * Installation errors roll back and throw before action. Action results/errors are preserved.
     * Overrides are process-wide while active; filter narrows matching calls. Requires methods exposed
     * to the Objective-C runtime (Swift must use ObjC-compatible dispatch). Restore the previous IMP;
     * overlapping overrides of the same method must finish in reverse installation order.
     * @example const enabled = Override.run([{ target: 'FeatureFlags', selector: '+ isEnabled', withReturn: true }], () => Boolean(ObjC.classes.FeatureFlags.isEnabled()));
     */
    run<TResult>(
      definitions: readonly IOSOverrideDefinition[],
      action: () => TResult,
    ): TResult extends Promise<infer TResolved> ? Promise<TResolved> : TResult;
  }

  interface IOSMethodHookInvocation {
    receiver: ObjCBridge.Object;
    className: string;
    selector: `- ${string}` | `+ ${string}`;
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
    /** Synchronous read-only entry extraction; finite, acyclic plain JSON only, no runtime wrappers. */
    args?: (invocation: IOSChainArgsInvocation) => IOSJsonValue;
    /** Synchronous, read-only JSON extraction on normal return only; same JSON restrictions as args.
     * Same scalar decoding as args; void is undefined (omit extraction or explicitly return JSON null).
     * Float/double/aggregate returns are unsupported. Receiver/entry args are not retained.
     */
    result?: (invocation: { className: string; selector: `- ${string}` | `+ ${string}`;
      result: NativePointer | number | boolean | string | undefined }) => IOSJsonValue;
    /** Default off. Emits elapsedMs in fractional milliseconds, measured with a monotonic clock.
     * Includes children/thread waits, excludes system sleep.
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
    /** Objective-C class name or class wrapper. */
    target: string | ObjCBridge.Object;
    /** Exact Objective-C instance or class selector, including its '- ' or '+ ' prefix. */
    selector: `- ${string}` | `+ ${string}`;
    /** Runs on the intercepted thread; only literal true keeps evidence. False/throw skips capture and preserves the call. Synchronous/read-only; args are available only to capture.args. */
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

  /** Synchronous, read-only getters on the current JS thread, keyed by state path. Return plain JSON. */
  type IOSStateGetters = Readonly<Record<string, () => IOSJsonValue>>;
  /** Non-empty map with non-empty keys; identifiers/paths only, no UIView objects. */
  type IOSUiTargets = Readonly<Record<string, string | IOSUiPath>>;

  interface IOSProbeEvidenceApi {
    /** Capture selected Objective-C methods and TAG-prefixed NSLog messages during action.
     * Await action and remove hooks on completion or failure; return its result or propagate its error.
     * Records are written to Evidence. Method/log events include threadName (null when unavailable).
     * Supports multiple TAGs per call; at most one log-capture scope may be active (including nesting).
     * Hooks observe matching process calls, including unrelated concurrent work; use filter.
     * Requires Interceptor support; methods must be exposed to the Objective-C runtime (Swift needs
     * ObjC-compatible dispatch). Setup errors roll back and reject before action.
     * NSLog capture requires MobileEasyUse.dylib; os_log/Swift print are not captured.
     * Callbacks execute on intercepted threads and must be synchronous. Empty hooks plus no TAG capture nothing.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     * @param logTag Non-empty exact TAG or set of non-empty TAGs; omit for method-only capture; matches `[TAG] ` or `[%@]` with TAG as the first NSString argument.
     * @param methodHooks Methods to observe; omit for log-only capture.
     * @example const result = await Probe.evidence.withChainEvidence(() => IOS.input.click('search.submit'), 'Submit search', 'Search');
     */
    withChainEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      logTag?: string | Set<string>,
      methodHooks?: readonly IOSMethodHook[],
    ): Promise<Awaited<TResult>>;

    /** Capture synchronous state getters before action and again in finally; await and return action's
     * result or propagate its error. Values go to Evidence, not the return value. An empty map records nothing.
     * Getter errors are reported without stopping other getters or action. Getters are never awaited or
     * dispatched to main; use JSON primitives/arrays/plain objects, not ObjC objects or NativePointers.
     * @example let count = 0; await Probe.evidence.withStateEvidence(() => ++count, 'Increment', { count: () => count });
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     */
    withStateEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      stateGetters: IOSStateGetters,
    ): Promise<Awaited<TResult>>;

    /** Capture UIKit state plus App-window and visible element screenshots before and after action,
     * including an after checkpoint on action failure. Non-empty key-to-identifier/path map required.
     * Re-resolves paths on main; invalid targets reject before action. Per-target query errors are
     * reported/skipped; screenshot failures yield null paths. UI and images are separate reads.
     * Evidence includes className, exist, visible, screen-point bounds, accessibility properties,
     * userInteractionEnabled when readable, and screenshots. Here visible tests only the View's own
     * hidden/alpha/bounds and window attachment; wait.ui additionally checks ancestors.
     * Returns awaited action result (not snapshots), propagates action error; finalizer errors are reported.
     * @example await Probe.evidence.withUiEvidence(() => IOS.input.click('search.submit'), 'Submit', { submit: 'search.submit' });
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

  /** iOS main-queue work, UIKit queries/screenshots/waits, and XCTest-backed input. */
  const IOS: Readonly<IOSApi>;
  /** Action-scoped Objective-C method return overrides. */
  const Override: Readonly<IOSOverrideApi>;
  /** Action-scoped chain, state, and UIKit evidence capture. */
  const Probe: Readonly<IOSProbeApi>;
}
