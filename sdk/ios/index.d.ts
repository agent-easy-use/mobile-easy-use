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
  /** Public runtime namespaces. */
  const drive: Readonly<IOSDriveApi>;
  const override: Readonly<IOSOverrideRuntimeApi>;
  const inspect: Readonly<IOSInspectApi>;
  const element: Readonly<IOSElementApi>;
  const common: Readonly<IOSCommonApi>;

  interface IOSDriveApi {
    click: IOSInputApi['click'];
    longPress: IOSInputApi['longPress'];
    input: IOSInputApi['input'];
    scroll: IOSInputApi['scroll'];
    wait: IOSDriveWait;
    waitUntil: IOSWaitApi['until'];
  }
  interface IOSElementApi {
    /** Resolve an identifier or path on main, starting at the key window (or first visible window).
     * Each step searches the preceding UIView and its descendants, including itself, without backtracking.
     * Missing targets return null; invalid targets throw. Matching does not require visibility.
     * Raw wrapper operations retain UIKit thread requirements. Virtual accessibility/SwiftUI nodes
     * without a UIView are not searchable.
     * @example const view = await element.findUiView(['identifier::form.container', 'label::Submit']);
     */
    findUiView(target: string | IOSUiPath): Promise<ObjCBridge.Object | null>;
  }
  interface IOSCommonApi {
    /** Only the synchronous part before the first await runs on main; returned promises are adopted.
     * Callback errors reject. Never block waiting for the returned Promise.
     */
    runOnMainThread<T>(work: () => T | Promise<T>): Promise<T>;
    /** Name of the calling thread; null if unnamed or unavailable. No thread dispatch. */
    currentThreadName(): string | null;
    /** Exact name first, then module-qualified suffix; null if absent, throws if ambiguous. Objective-C runtime classes only. */
    findClass(className: string, selectors?: readonly string[]): ObjCBridge.Object | null;
  }
  interface IOSMethodDefinition { className: string; selector: `- ${string}` | `+ ${string}`; filter?: (...args: NativeCallbackArgumentValue[]) => boolean }
  interface IOSOverrideRuntimeApi {
    /** Async installation and removal; filter and returnInstead callbacks remain synchronous. When supplied, only literal true passes filter;
     * callback/filter errors are reported and fall back to the original method.
     * Arguments and return use NativeCallback ABI values, not high-level ObjC conversion:
     * object arguments are pointers, BOOL is numeric, and structs/64-bit values use Frida ABI types.
     * Remove nested replacements in reverse order.
     */
    method(definition: IOSMethodDefinition, returnInstead: NativeCallbackReturnValue | ((...args: NativeCallbackArgumentValue[]) => NativeCallbackReturnValue)): Promise<() => Promise<void>>;
    /** Write through Objective-C property accessors; remove restores the saved value.
     * No main-thread dispatch: both installation and removal run accessors on the calling thread.
     * For UIKit or other main-thread properties, dispatch BOTH calls with common.runOnMainThread.
     * @example const remove = await common.runOnMainThread(() => override.field({ instance: label, property: 'text' }, title));
     * @example await common.runOnMainThread(remove);
     */
    field(definition: { instance: ObjCBridge.Object; property: string }, value: any): Promise<() => Promise<void>>;
    /** Async installation; invoke and await the returned closure to remove.
     * earlyReturn is an LLDB expression. Swift early return is not supported reliably:
     * Swift Int(200) can report success but return an incorrect value to the native caller.
     * Use Swift local-variable overrides instead. Objective-C returns still require an ABI-compatible expression.
     */
    code(definition: IOSCodeDefinition, overrides?: Record<string, string>, earlyReturn?: string): Promise<() => Promise<void>>;
  }
  type IOSInspectResult<T> = { ok: true; data: T[]; error: null } | { ok: false; data: T[]; error: string };
  interface IOSWatcher<T> {
    current(): Promise<IOSInspectResult<T>>;
    stop(): Promise<IOSInspectResult<T>>;
  }
  interface IOSLogRecord { timestamp: string; threadId: number; threadName: string | null; tag: string; level: string | null; message: string }
  interface IOSMethodEnter { receiver: ObjCBridge.Object; args: NativeCallbackArgumentValue[] }
  interface IOSMethodLeave extends IOSMethodEnter { result: NativeCallbackReturnValue; exception: undefined }
  /** Callbacks run synchronously on the intercepted thread. Returned records are not serialized
   * or deep-copied. A JS reference alone does not extend a borrowed native object's lifetime.
   * Prefer copying business values in the callback. To use an ObjC object later, explicitly
   * retain it before returning the record and release it when finished; stop() does not release it.
   * Arguments/results use raw NativeCallback ABI values; convert object pointers with ObjC.Object.
   */
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
     * @example const result = await drive.click('form.submit');
     */
    click(target: IOSInputTarget): Promise<IOSClickResult>;
    /** Tap to focus, then synthesize a non-empty text input; existing contents are not cleared.
     * Tap completion does not verify keyboard focus or the resulting text.
     * @example const result = await drive.input('form.text', 'hello');
     */
    input(target: IOSInputTarget, text: string): Promise<IOSTargetInputResult>;
    /** Compute endpoints in the App and drag in the finger direction, clamped to visible target
     * bounds (App bounds for a raw coordinate). Completion does not wait for scrolling inertia.
     * Distance is fixed at 300 points and may be clamped.
     * @example const result = await drive.scroll('form.results', 'up');
     */
    scroll(target: IOSInputTarget, direction: IOSInputDirection): Promise<IOSScrollResult>;
    /** Resolve the target in the App and synthesize a real touch held for 600 ms.
     * @example const result = await drive.longPress({ x: 120, y: 360 });
     */
    longPress(target: IOSInputTarget): Promise<IOSLongPressResult>;
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
    /** Poll a sync/async boolean predicate sequentially until true. Errors retry until timeout.
     * Invalid return types fail with INVALID_ARGUMENT. Timeout does not cancel an in-flight predicate.
     * @example const ready = await drive.waitUntil(() => cacheReady, { timeoutMs: 10000 });
     */
    until(predicate: () => boolean | Promise<boolean>, options?: IOSWaitOptions): Promise<IOSWaitResult>;
  }

  const Test: Readonly<IOSTestApi>;

  type IOSTestCallback = () => unknown;
  type IOSTestJsonValue = null | boolean | number | string
    | readonly IOSTestJsonValue[] | { readonly [key: string]: IOSTestJsonValue };

  /** Choose assertions by verification target:
   * - UI controls and properties: read with inspect.ui or native access on main, then assert the returned value.
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
