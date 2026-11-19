/// <reference types="frida-gum" />

import ObjCBridge from 'frida-objc-bridge';
import SwiftBridge from 'frida-swift-bridge';

export {};

/**
 * Canonical API contract for generating iOS probe scripts. Load the built ios.js in Bootstrap,
 * then use ObjC, Swift, IOS, Override, Probe, and runtimeStatus as globals; do not import this file at runtime.
 * Load only this platform declaration; Android and iOS globals belong to separate runtimes.
 * Probe modules should export functions and perform actions when called, not at module load.
 * Await asynchronous SDK calls and check result.ok before relying on an action or wait.
 * Return JSON-serializable values to the Host; convert ObjC objects and NativePointers first.
 *
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless a method JSDoc states a caller-thread requirement.
 */
declare global {
  /** Independent sdk/ios/inspect/index.js module: import { inspect } from its source.
   * All UI methods schedule native access on the main thread. Root exports are integrated separately.
   */
  interface IOSInspectUiApi {
    /** Missing target returns false. Native objects refer to the supplied instance. */
    isExisting(target: IOSInspectUiTarget): Promise<boolean>;
    /** Existing geometric visibility semantics; excludes occlusion. */
    isVisible(target: IOSInspectUiTarget): Promise<boolean>;
    /** Existing but geometrically invisible; missing targets return false. */
    isHidden(target: IOSInspectUiTarget): Promise<boolean>;
    /** Target's native input focus, not accessibility focus. */
    isFocused(target: IOSInspectUiTarget): Promise<boolean>;
    /** Own userInteractionEnabled, additionally isEnabled() for UIControl. */
    isEnabled(target: IOSInspectUiTarget): Promise<boolean>;
    /** Root is depth 0; default 3; integer 0..64. Empty children may mean depth limit.
     * Requires an attached window to convert bounds to px.
     * Node targets are borrowed UIView references owned by their UI hierarchy. Retain/release explicitly on main if needed beyond that lifetime.
     * @example const root = await inspect.ui.tree(target, 2);
     */
    tree(target: IOSInspectUiTarget, depth?: number): Promise<IOSUITreeNode>;
    /** Local bounds in px. Uses UIView.bounds and the attached screen scale; requires a window. */
    layout(target: IOSInspectUiTarget): Promise<IOSUILocalLayout>;
    /** Reference bounds and transformed target AABB in the same coordinate space; no clipping. */
    layoutInParent(target: IOSInspectUiTarget): Promise<IOSUIRelativeLayout>;
    layoutInWindow(target: IOSInspectUiTarget): Promise<IOSUIRelativeLayout>;
    layoutInScreen(target: IOSInspectUiTarget): Promise<IOSUIRelativeLayout>;
    /** Current App window image. Uses the platform window hierarchy renderer. */
    screenshotWindow(): Promise<IOSUIWindowScreenshot>;
    /** Required target; capture its owning window and draw an inward border on Host.
     * Rejects missing targets, missing windows and empty intersection. Preserves App hierarchy.
     */
    /** Dashed stroke: 2 pt using window UIScreen.scale. */
    /** highlightTraget defaults to true; false returns the target owning window original. */
    screenshot(target: IOSInspectUiTarget, highlightTraget?: boolean): Promise<IOSUIWindowScreenshot>;
  }
  type IOSInspectUiTarget = string | IOSUiPath | ObjCBridge.Object;
  interface IOSUITreeNode {
    className: string;
    target: ObjCBridge.Object;
    /** Local bounds in px, captured during traversal. */
    bounds: IOSUIRect;
    children: IOSUITreeNode[];
  }
  interface IOSUIRect { x: number; y: number; width: number; height: number }
  interface IOSUILocalLayout {
    bounds: IOSUIRect;
    unit: 'px';
    /** Owning UIScreen.scale, not nativeScale; pt = px / scale. */
    scale: number;
  }
  interface IOSUIRelativeLayout extends IOSUILocalLayout { targetBounds: IOSUIRect }
  interface IOSUIWindowScreenshot {
    filePath: string;
    width: number;
    height: number;
    format: 'png' | 'jpeg';
    unit: 'px';
    /** Captured window rectangle in screen coordinates. */
    region: IOSUIRect;
    /** Captured rectangle in window/root coordinates, used for image mapping. */
    sourceBounds: IOSUIRect;
    /** Actual highlighted rectangle in output image pixels; null for window originals. */
    highlight: IOSUIRect | null;
    capturedAt: string;
    captureMethod: 'draw-view-hierarchy';
  }

  const Swift: typeof SwiftBridge;
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

  /** Non-empty values, matched case-sensitively. identifier/label match exactly.
   * class:: matches a full runtime class name, including subclasses.
   * No JS getters or text:: steps.
   */
  type IOSUiPathStep =
    | `identifier::${string}`
    | `label::${string}`
    | `class::${string}`;

  /** Non-empty path. ui.find/wait/screenshot/evidence/input share the native UIView query.
   * Each step selects the first match in the preceding subtree, including its root; no backtracking.
   */
  type IOSUiPath = readonly [IOSUiPathStep, ...IOSUiPathStep[]];

  type IOSUiState = 'exists' | 'visible' | 'hidden' | 'focused' | 'enabled';

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
     * @example const view = IOS.ui.find('form.submit');
     */
    find(accessibilityIdentifier: string): ObjCBridge.Object | null;
    /** Resolve each step in the preceding UIView subtree (including that View). Returns null on any miss.
     * @example const view = IOS.ui.find(['identifier::form.container', 'label::Submit']);
     */
    find(path: IOSUiPath): ObjCBridge.Object | null;
    /** Resolve and check once on the main queue; no polling. Missing targets return false for every state.
     * hidden requires an existing, geometrically invisible UIView. visible checks window attachment,
     * ancestor hidden/alpha > 0.01 and axis-aligned clipping against ancestors, window and screen;
     * not occlusion, masks or presentation-layer animation geometry. focused uses isFirstResponder().
     * enabled checks the target's userInteractionEnabled and, for UIControl, isEnabled().
     * Does not check ancestors, visibility or operation-specific flags. Lookup/getter errors reject.
     */
    checkUiState(target: string | IOSUiPath, state: IOSUiState): Promise<boolean>;
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
     * @example const result = await IOS.input.click('form.submit');
     */
    click(target: IOSInputTarget): Promise<IOSClickResult>;
    /** Tap to focus, then synthesize a non-empty text input; existing contents are not cleared.
     * Tap completion does not verify keyboard focus or the resulting text.
     * @example const result = await IOS.input.input('form.text', 'hello');
     */
    input(target: IOSInputTarget, text: string): Promise<IOSTargetInputResult>;
    /** Compute endpoints in the App and drag in the finger direction, clamped to visible target
     * bounds (App bounds for a raw coordinate). Completion does not wait for scrolling inertia.
     * @param distance Positive finite distance in points; defaults to 300, may be clamped.
     * @example const result = await IOS.input.scroll('form.results', 'up', 300);
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

  type IOSUiWaitState = IOSUiState;
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

  /** Standalone drive module wait contract; not installed as a global API yet.
   * Identifiers/paths are resolved each poll; native UIViews are checked directly on the main queue.
   * A valid native UIView satisfies exists even when detached. Coordinates are not accepted.
   */
  type IOSDriveWait = (
    target: string | IOSUiPath | ObjCBridge.Object,
    state: IOSUiWaitState,
    options?: IOSWaitOptions,
  ) => Promise<IOSWaitResult>;

  interface IOSWaitApi {
    /** Poll ui.checkUiState with wait.until. hidden requires an existing, invisible UIView.
     * Lookup errors, including invalid targets, retry until TIMEOUT with lastCheckError.
     * @example const ready = await IOS.wait.ui('form.results', 'visible', { timeoutMs: 10000 });
     */
    ui(
      target: string | IOSUiPath,
      state: IOSUiWaitState,
      options?: IOSWaitOptions,
    ): Promise<IOSWaitResult>;
    /** Poll a sync/async boolean predicate sequentially until true. Errors retry until timeout.
     * Invalid return types fail with INVALID_ARGUMENT. Timeout does not cancel an in-flight predicate.
     * @example const ready = await IOS.wait.until(() => cacheReady, { timeoutMs: 10000 });
     */
    until(predicate: () => boolean | Promise<boolean>, options?: IOSWaitOptions): Promise<IOSWaitResult>;
  }

  type IOSObjCSelector = `- ${string}` | `+ ${string}`;

  interface IOSRuntimeApi {
    /** Find an Objective-C class or a Swift class registered in the Objective-C Runtime.
     * First checks className as an exact Runtime name, then checks Runtime names ending in
     * `.${className}`. selectors is optional and is only needed to disambiguate when className may
     * match classes from multiple modules. When provided, every selector must exist on a candidate;
     * inherited methods are included. Returns null for no match and throws with all full Runtime
     * names when multiple candidates remain.
     * @example const controller = IOS.runtime.findClass('AuthViewController');
     * @example const controller = IOS.runtime.findClass('AuthViewController', ['- submit']);
     */
    findClass(
      className: string,
      selectors?: readonly IOSObjCSelector[],
    ): ObjCBridge.Object | null;
  }

  interface IOSApi {
    /** Schedule work on the iOS main queue. Only the synchronous part before the first await
     * is guaranteed to run there; a returned Promise is adopted, not kept on the main queue.
     * Callback errors reject; unavailable ObjC throws synchronously. Never block waiting for this Promise.
     * @example const label = await IOS.runOnMainThread(() => IOS.ui.find('form.submit')?.accessibilityLabel()?.toString() ?? null);
     */
    runOnMainThread<TResult>(work: () => TResult | Promise<TResult>): Promise<TResult>;
    readonly runtime: IOSRuntimeApi;
    /** Capture the focused App Window, keyed element crops, or both, using the native UIView query.
     * Requires MEUScreenshot and Host file controller; image values are saved Host JPEG paths.
     * Missing/hidden/out-of-window targets can be omitted on success; check each requested key.
     * Invalid options, failed/incomplete capture, and persistence errors resolve ok:false.
     * @example const shot = await IOS.screenshot({ targets: { submit: 'form.submit' }, includeWindow: true });
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
    /** Objective-C Runtime class name resolved through IOS.runtime.findClass, or a class wrapper. */
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
    /** Install a non-empty list of method or field definitions, call action, and restore in reverse order after return/throw or
     * settlement of a native JS Promise. Custom thenables do not extend the scope; use async action.
     * Installation errors roll back and throw before action. Action results/errors are preserved.
     * Overrides are process-wide while active; filter narrows matching calls. Requires methods exposed
     * to the Objective-C runtime (Swift must use ObjC-compatible dispatch). Restore the previous IMP;
     * overlapping overrides of the same method must finish in reverse installation order.
     * @example const enabled = Override.run([{ target: 'FeatureFlags', selector: '+ isEnabled', withReturn: true }], () => Boolean(ObjC.classes.FeatureFlags.isEnabled()));
     */
    run<TResult>(
      definitions: readonly (IOSOverrideDefinition | IOSOverrideFieldDefinition)[],
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
    /** Synchronous read-only entry extraction; returns data serialized as JSON. */
    args?: (invocation: IOSChainArgsInvocation) => IOSJsonValue;
    /** Synchronous, read-only JSON extraction on normal return only.
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
    /** Objective-C Runtime class name resolved through IOS.runtime.findClass, or a class wrapper.
     * Matches that class and subclasses using this IMP;
     * subclass overrides at other addresses require separate hooks. Events use the configured className.
     */
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

  /** Read-only getters keyed by state path; await each result and return plain JSON. */
  type IOSStateGetters = Readonly<Record<string, () => IOSJsonValue | Promise<IOSJsonValue>>>;
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
     * @example const result = await Probe.evidence.withChainEvidence(() => IOS.input.click('form.submit'), 'Submit form', 'Form');
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
     * An empty map records nothing. Values go to Evidence, not the return value.
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
     * @example await Probe.evidence.withUiEvidence(() => IOS.input.click('form.submit'), 'Submit', { submit: 'form.submit' });
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

  /** JSON snapshot primitives. Wide integers and non-finite floats use strings.
   * Native strings preserve content. Complex values use LLDB summary/value text;
   * no recursive field expansion or automatic business description call.
   */
  type IOSDebuggerValue = null | boolean | number | string;

  interface IOSDebuggerDefinition {
    breakpoint:
      | { kind: 'source'; file: string; line: number; condition?: string }
      | { kind: 'address'; address: string; condition?: string };
    /** Maximum original hit-thread frames, 1..256. Omit to skip stack collection. */
    stack?: number;
    /** Key → complete native LLDB expression, evaluated once in the hit frame.
     * May contain function definitions/calls in a native expression block and have
     * side effects. No JS callbacks, bindings or ordering/dependency between entries.
     * Void/no-result expressions produce null. Failure omits the key and adds an
     * errors entry; other observations continue unless the hit context is unsafe.
     */
    observations?: Readonly<Record<string, string>>;
    /** Native assignment target → native value expression, evaluated as target = (expression).
     * Targets may be locals, properties or subscripts (e.g. 'self.price', 'items[0]').
     * LLDB resolves scope, types and writability; setters/subscripts may run target code.
     * Like LLDB, writing a compiler debug-only copy may not affect resumed code.
     * Runs after observations, with native assignment semantics and no entry order
     * guarantee. Completed writes are not rolled back; ordinary failures do not skip earlyReturn.
     */
    overrides?: Readonly<Record<string, string>>;
    /** Native expression evaluated unchanged after overrides; passes its SBValue directly
     * to LLDB ReturnFromFrame. The caller must produce a suitable native type, e.g.
     * 'Int32(42)'; no return-type inference, cast insertion or type/frame whitelist.
     * Swift Void uses '()', OC void uses '(void)0'. Skips remaining code including
     * defer/destructors. Actual type/frame support depends on LLDB; failures add errors.
     * Apple LLDB 1703 behavior needs separate validation; no register workaround.
     * Success adds no output field.
     */
    earlyReturn?: string;
  }

  interface IOSDebuggerError {
    stage: 'condition' | 'stack' | 'observations' | 'overrides' | 'earlyReturn' | 'framework';
    name?: string;
    message: string;
  }

  interface IOSDebuggerHit {
    hitId: string;
    /** Unix seconds. */
    timestamp?: number;
    thread?: { id: string; name: string | null };
    observations?: Record<string, IOSDebuggerValue>;
    stack?: Array<{ index: number; function: string | null; module: string | null;
      address: string; file: string | null; line: number | null }>;
    errors?: IOSDebuggerError[];
  }

  interface IOSDebuggerApi {
    /** Host LLDB breakpoint; requires a debug-enabled App, Host Xcode and matching symbols.
     * No debugger native bridge required. Source: existing absolute Host file, positive
     * exact executable line resolvable by LLDB using loaded symbols/source mappings. Address: hex loaded address.
     * Native condition belongs in breakpoint.condition; LLDB evaluates it before stopping.
     * Stages: condition → stack → observations → overrides → earlyReturn → resume.
     * At least one stage must be configured. Expressions use the frame's language,
     * run with other threads stopped and have a 2-second evaluation timeout.
     * Text snapshots are limited to 64 KiB; oversized/unreadable items add errors.
     * Worker buffers records until stop(); no streaming or App publication.
     * stop() removes the breakpoint without pausing and returns already-collected
     * records; pending hits may be omitted. Concurrent/repeated calls share the result.
     * Stop before detach; uncollected records are lost on detach
     * or Worker failure. Ordinary unrelated stops resume automatically. Serious
     * target exceptions/unsafe expression state end debugging and attempt detach;
     * records (including detach failures) remain available to stop(). New adds fail.
     * Overlapping mutating hits are rejected. Lifecycle API automation is undecided.
     * @example
     * await Probe.debugger.attach();
     * const stop = await Probe.debugger({
     *   breakpoint: { kind: 'source', file: '/project/Price.swift', line: 42, condition: 'price > 100' },
     *   stack: 5,
     *   observations: { before: 'price', computed: '{ let x = price * 2; return x }()' },
     *   overrides: { price: 'price * 2' },
     * });
     * const records = await stop();
     * await Probe.debugger.detach();
     */
    (definition: IOSDebuggerDefinition): Promise<() => Promise<IOSDebuggerHit[]>>;
    /** Attaches using Process.id and the Host connection's resolved device type/UDID.
     * LLDB automatically discovers local debug-map objects and dSYMs. Optional Host
     * .meu/config.json ios.debugger.dsymPaths entries are each loaded once, in order;
     * relative paths resolve from the config file's directory. No deduplication.
     * Symbol loading failures are returned without failing attach or blocking later
     * entries. No main-executable line tables are required; each source breakpoint
     * must resolve to a loaded executable location when registered.
     * Await before registration; after attach failure detach before retrying. */
    attach(): Promise<{
      symbolLoadErrors: Array<{ path: string; resolvedPath: string; message: string }>;
    }>;
    /** Removes all breakpoints and closes LLDB; does not collect records.
     * Idempotent after success. Call each stop() first if records are needed. */
    detach(): Promise<void>;
  }

  interface IOSProbeApi {
    readonly debugger: IOSDebuggerApi;
    readonly evidence: IOSProbeEvidenceApi;
  }

  /** iOS main-queue work, UIKit queries/screenshots/waits, and XCTest-backed input. */
  const IOS: Readonly<IOSApi>;
  /** Action-scoped Objective-C method return overrides. */
  const Override: Readonly<IOSOverrideApi>;
  /** Action-scoped chain, state, and UIKit evidence capture. */
  const Probe: Readonly<IOSProbeApi>;

  const Test: Readonly<IOSTestApi>;

  type IOSTestCallback = () => unknown;
  type IOSTestJsonValue = null | boolean | number | string
    | readonly IOSTestJsonValue[] | { readonly [key: string]: IOSTestJsonValue };

  /** Choose assertions by verification target:
   * - UI controls and properties: use UI matchers for existence, visibility, focus and enabled state;
   *   use toSatisfy for custom checks of text and other properties.
   * - Visual appearance: use screenshot matchers.
   * - Native business objects and state: read primitive values or plain JSON snapshots,
   *   then use general-purpose matchers.
   *
   * Mismatches throw or reject with AssertionError.
   * Await async matchers; none poll. .not inverts comparison results, never input or observation errors.
   */
  interface IOSTestMatchers {
    readonly not: IOSTestMatchers;
    /** Compare using Object.is; native wrappers use JavaScript reference identity. */
    toBe(expected: unknown): void;
    /** Structural comparison for acyclic plain JSON objects, arrays and primitive values.
     * Object key order is ignored; array order matters. Only own enumerable string keys are compared.
     * Native objects, Date, Map, Set and cyclic graphs are unsupported; inputs are not validated.
     */
    toEqual(expected: IOSTestJsonValue): void;
    /** Numeric comparisons require finite numbers on both sides; no coercion. */
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    /** Requires a string observation; matching never changes the supplied RegExp.lastIndex. */
    toMatch(expected: RegExp): void;
    /** String substring or array membership (not deep equality). */
    toContain(expected: unknown): void;
    /** Target exists. UI state assertions resolve via IOS.ui.find once on the main thread.
     * Targets: accessibility identifier or native UI path.
     * Missing targets fail all five positive UI state assertions, including toBeHidden.
     */
    toExist(): Promise<void>;
    /** Attached, not hidden, cumulative ancestor alpha > 0.01, with nonempty clipped screen bounds.
     * Intersects axis-aligned bounds with clipping ancestors, window and screen.
     * Excludes occlusion, masks and presentation-layer animation geometry.
     */
    toBeVisible(): Promise<void>;
    /** UI target exists but is not geometrically visible. Missing is not hidden. */
    toBeHidden(): Promise<void>;
    /** Target itself has input focus via isFirstResponder(). Not accessibility focus. */
    toBeFocused(): Promise<void>;
    /** Target userInteractionEnabled, additionally isEnabled() for UIControl.
     * Checks only the target itself, not ancestors, visibility or operation-specific flags. */
    toBeEnabled(): Promise<void>;
    /** Resolve once and invoke a read-only predicate on the main thread; await its boolean result.
     * After await, native UI access must explicitly use IOS.runOnMainThread.
     * Missing targets and non-boolean results are errors.
     */
    toSatisfy(predicate: (view: ObjCBridge.Object) => boolean | Promise<boolean>): Promise<void>;
    /** Capture the current element through IOS.screenshot, then compare on Host.
     * Use expect(target); baselinePath points to an existing Host PNG/JPEG.
     * Relative paths resolve against the call_function entry module directory; Inline requires an absolute path.
     * Handles platform thread dispatch internally. No baseline updates or diff images.
     * Color threshold is 0.2; anti-alias differences are ignored. Size mismatch fails.
     * On mismatch, AssertionError actual/expected contain the captured/baseline Host paths.
     * Capture, missing-image, file/decoding/transport errors propagate, including under .not.
     * @example await Test.create().expect('button').toHaveElementScreenShot('/absolute/baseline.png');
     */
    toHaveElementScreenShot(baselinePath: string, options?: {
      /** Allowed differing pixel ratio in [0, 1], inclusive. Defaults to 0. */
      maxDiffPixelRatio?: number;
    }): Promise<void>;
    /** Capture the current window through IOS.screenshot, then compare on Host.
     * Use expect(); baselinePath points to an existing Host PNG/JPEG.
     * Relative paths resolve against the call_function entry module directory; Inline requires an absolute path.
     * Handles platform thread dispatch internally. No baseline updates or diff images.
     * Color threshold is 0.2; anti-alias differences are ignored. Size mismatch fails.
     * On mismatch, AssertionError actual/expected contain the captured/baseline Host paths.
     * Capture, missing-image, file/decoding/transport errors propagate, including under .not.
     * @example await Test.create().expect().toHaveWindowScreenShot('/absolute/baseline.png');
     */
    toHaveWindowScreenShot(baselinePath: string, options?: {
      /** Allowed differing pixel ratio in [0, 1], inclusive. Defaults to 0. */
      maxDiffPixelRatio?: number;
    }): Promise<void>;
  }

  interface IOSTestExpect {
    /** Create matchers for an actual value or UI target; message prefixes assertion failures. */
    (actual?: unknown, message?: string): IOSTestMatchers;
  }

  type IOSTestSelection = { describe?: undefined; test?: undefined }
    | { describe: string; test?: string };

  interface IOSTestReference {
    describe: string;
    test: string;
  }

  interface IOSTestFailure {
    phase: 'beforeEach' | 'test' | 'afterEach';
    name: string;
    message: string;
    stack: string;
    matcher?: string;
    /** Display strings, not native object references. */
    actual?: string;
    expected?: string;
  }

  interface IOSTestResult extends IOSTestReference {
    status: 'passed' | 'failed' | 'notRun';
    durationMs: number;
    errors: IOSTestFailure[];
  }

  interface IOSTestReport {
    ok: boolean;
    total: number;
    passed: number;
    failed: number;
    notRun: number;
    tests: IOSTestResult[];
  }

  interface IOSTestCollection {
    /** Register a non-nested group with a unique name; callback must be synchronous registration only.
     * An uncaught registration error discards the group.
     */
    describe(name: string, register: () => void): void;
    /** Register inside describe with a unique name; return or await all asynchronous work.
     * Return values do not determine success. Throw, reject or use expect to fail.
     */
    test(name: string, callback: IOSTestCallback): void;
    /** Group-local hooks run in declaration order before every selected test. */
    beforeEach(callback: IOSTestCallback): void;
    /** All cleanup hooks are attempted in declaration order, even after setup/body failure.
     * Cleanup must tolerate partial setup. Cleanup failures fail the test without replacing earlier errors.
     */
    afterEach(callback: IOSTestCallback): void;
    readonly expect: IOSTestExpect;
    /** List registered test names in declaration order. */
    list(): IOSTestReference[];
    /** Run all with no selection or {}; otherwise select a describe or a describe+test pair.
     * Invalid selections or no matching tests reject. Runs serially; after failure, remaining tests are notRun.
     * While running, registration and concurrent/nested runs across collections are rejected.
     * Test failures resolve with a report; check report.ok. Collections can run again after completion.
     */
    run(selection?: IOSTestSelection): Promise<IOSTestReport>;
  }

  interface IOSTestApi {
    /** Create an independent test collection.
     * @example const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
     */
    create(): IOSTestCollection;
  }
}
