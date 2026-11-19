/// <reference types="frida-gum" />

import ObjCBridge from 'frida-objc-bridge';
import SwiftBridge from 'frida-swift-bridge';

export {};

/**
 * Canonical API contract for generating iOS probe scripts. Load the built ios.js in Bootstrap,
 * then use ObjC, Swift, drive, override, inspect, element, common, Test, and runtimeStatus as globals; do not import this file at runtime.
 * Load only this platform declaration; Android and iOS globals belong to separate runtimes.
 * Probe modules should export functions and perform actions when called, not at module load.
 * Await asynchronous SDK calls and check result.ok before relying on an action or wait.
 * Return JSON-serializable values to the Host; convert ObjC objects and NativePointers first.
 *
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless a method JSDoc states a caller-thread requirement.
 */
declare global {
  /** Public runtime namespaces. Legacy implementation types below are not exported entry points. */
  const drive: Readonly<IOSDriveApi>;
  const override: Readonly<IOSOverrideRuntimeApi>;
  const inspect: Readonly<IOSInspectApi>;
  const element: Readonly<IOSElementApi>;
  const common: Readonly<IOSCommonApi>;

  interface IOSDriveApi {
    click: IOSInputApi['click'];
    longPress(target: Parameters<IOSInputApi['longPress']>[0]): Promise<IOSLongPressResult>;
    input: IOSInputApi['input'];
    scroll(target: Parameters<IOSInputApi['scroll']>[0], direction: Parameters<IOSInputApi['scroll']>[1]): Promise<IOSScrollResult>;
    wait: IOSDriveWait;
    waitUntil: IOSWaitApi['until'];
  }
  interface IOSElementApi {
    /** Resolve on main; missing targets return null. Raw wrapper operations retain native thread requirements. */
    findUiView(target: string | IOSUiPath): Promise<ObjCBridge.Object | null>;
  }
  interface IOSCommonApi {
    runOnMainThread<T>(work: () => T | Promise<T>): Promise<T>;
    /** Name of the calling thread; null if unnamed or unavailable. No thread dispatch. */
    currentThreadName(): string | null;
    /** Exact name first, then module-qualified suffix; null if absent, throws if ambiguous. Objective-C runtime classes only. */
    findClass(className: string, selectors?: readonly string[]): ObjCBridge.Object | null;
  }
  interface IOSMethodDefinition { className: string; selector: `- ${string}` | `+ ${string}`; filter?: (...args: NativeCallbackArgumentValue[]) => boolean }
  interface IOSOverrideRuntimeApi {
    /** Synchronous callbacks. Arguments and return use NativeCallback ABI values, not high-level ObjC conversion. Remove nested replacements in reverse order. */
    method(definition: IOSMethodDefinition, returnInstead: NativeCallbackReturnValue | ((...args: NativeCallbackArgumentValue[]) => NativeCallbackReturnValue)): () => void;
    /** Write through Objective-C property accessors; remove restores the saved value. */
    field(definition: { instance: ObjCBridge.Object; property: string }, value: any): () => void;
    /** Async installation; invoke and await the returned closure to remove. */
    code(definition: IOSCodeDefinition, overrides?: Record<string, string>, earlyReturn?: string): Promise<() => Promise<void>>;
  }
  type IOSInspectResult<T> = { ok: true; data: T[]; error: null } | { ok: false; data: T[]; error: string };
  interface IOSWatcher<T> {
    current(): Promise<IOSInspectResult<T>>;
    stop(): Promise<IOSInspectResult<T>>;
  }
  interface IOSLogRecord { timestamp: string; threadId: number; threadName: string | null; tag: string; level: string; message: string }
  interface IOSMethodEnter { receiver: ObjCBridge.Object; args: NativeCallbackArgumentValue[] }
  interface IOSMethodLeave extends IOSMethodEnter { result: NativeCallbackReturnValue; exception: undefined }
  interface IOSMethodOptions {
    enter?: (context: IOSMethodEnter) => Record<string, any>;
    leave?: (context: IOSMethodLeave) => Record<string, any>;
    /** Maximum frame count; omitted or zero disables stack capture. */
    stack?: number;
  }
  interface IOSMethodFrame { address: string; moduleName: string | null; name: string | null; fileName: string | null; lineNumber: number | null }
  interface IOSMethodRecord {
    callId: number; timestamp: string; threadId: number; threadName: string | null;
    status: "running" | "returned"; durationMs: number | null;
    enter?: Record<string, any>; leave?: Record<string, any>; stack?: IOSMethodFrame[];
  }
  type IOSCodeDefinition = ({ kind: 'source'; file: string; line: number } | { kind: 'address'; address: string }) & { condition?: string };
  type IOSCodeCapture = Record<string, string>;
  interface IOSCodeFrame { function: string | null; module: string | null; sourceFile: string | null; line: number | null }
  interface IOSCodeOptions { capture?: IOSCodeCapture; stack?: number }
  interface IOSCodeRecord {
    hitId: string; timestamp: string; threadId: number; threadName: string | null;
    capture?: Record<string, IOSJsonValue>; stack?: IOSCodeFrame[];
  }
  interface IOSInspectApi {
    ui: IOSInspectUiApi;
    /** Exact TAG subscriptions; current returns cumulative records, stop unregisters. */
    log: { watch(tags: string[]): Promise<IOSWatcher<IOSLogRecord>> };
    /** Fixed signatures only; arguments/results use NativeCallback ABI. Variadic methods and native exception unwinding are unsupported. */
    method: { watch(definition: IOSMethodDefinition, options?: IOSMethodOptions): Promise<IOSWatcher<IOSMethodRecord>> };
    code: { watch(definition: IOSCodeDefinition, options?: IOSCodeOptions): Promise<IOSWatcher<IOSCodeRecord>> };
  }

  /** UI inspection. All UI methods schedule native access on the main thread.
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
    screenshotWindow(): Promise<IOSUIScreenshot>;
    /** Element image using the existing native window-render-and-crop implementation; no highlight. */
    screenshotElement(target: IOSInspectUiTarget): Promise<IOSUIScreenshot>;
    /** Required target; capture its owning window and draw an inward border on Host.
     * Rejects missing targets, missing windows and empty intersection. Preserves App hierarchy.
     */
    /** Dashed stroke: 2 pt using window UIScreen.scale. */
    /** highlight defaults to true; false returns the target owning window original. */
    screenshotElementInWindow(target: IOSInspectUiTarget, highlight?: boolean): Promise<IOSUIScreenshot>;
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
  interface IOSUIScreenshot {
    filePath: string;
    width: number;
    height: number;
    format: 'png' | 'jpeg';
    unit: 'px';
    /** Captured window or element region in screen coordinates. */
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

  /** Drive UI wait contract.
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

  /** iOS main-queue work, UIKit queries/screenshots/waits, and XCTest-backed input. */

  /** Action-scoped Objective-C method return overrides. */


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
    /** Capture the current element through inspect.ui.screenshotElement, then compare on Host.
     * Use expect(target); baselinePath points to an existing Host PNG/JPEG.
     * Relative paths resolve against the call_function entry module directory; Inline requires an absolute path.
     * Handles platform thread dispatch internally. No baseline updates or diff images.
     * Color threshold is 0.2; anti-alias differences are ignored. Size mismatch fails.
     * On mismatch, AssertionError actual/expected contain the captured/baseline Host paths.
     * Capture, missing-image, file/decoding/transport errors propagate, including under .not.
     * @example await Test.create().expect('button').toMatchElementScreenshot('/absolute/baseline.png');
     */
    toMatchElementScreenshot(baselinePath: string, options?: {
      /** Allowed differing pixel ratio in [0, 1], inclusive. Defaults to 0. */
      maxDiffPixelRatio?: number;
    }): Promise<void>;
    /** Capture the current window through inspect.ui.screenshotWindow, then compare on Host.
     * Use expect(); baselinePath points to an existing Host PNG/JPEG.
     * Relative paths resolve against the call_function entry module directory; Inline requires an absolute path.
     * Handles platform thread dispatch internally. No baseline updates or diff images.
     * Color threshold is 0.2; anti-alias differences are ignored. Size mismatch fails.
     * On mismatch, AssertionError actual/expected contain the captured/baseline Host paths.
     * Capture, missing-image, file/decoding/transport errors propagate, including under .not.
     * @example await Test.create().expect().toMatchWindowScreenshot('/absolute/baseline.png');
     */
    toMatchWindowScreenshot(baselinePath: string, options?: {
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
