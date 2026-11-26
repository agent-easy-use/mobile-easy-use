/// <reference types="frida-gum" />

/**
 * Canonical API contract for generating Android probe scripts. Read this file alone for SDK usage.
 *
 * This file is documentation and code-generation context only. It is not
 * loaded into Frida. Load the built `android.js` once in the shared Bootstrap runtime
 * before loading business ES Modules that use the global Java, R, drive, override, inspect, element, common, Test,
 * and runtimeStatus APIs. These are globals, not imports from this file.
 * Load only this platform declaration; Android and iOS globals belong to separate runtimes.
 * Probe modules should export functions and perform actions when called, not at module load.
 * Await asynchronous SDK calls and check result.ok before relying on an action or wait.
 * Return values are serialized by the transport for Host/Agent; ordinary objects need no manual stringify.
 * Prefer extracting JSON-compatible business values from native objects before returning them:
 * default serialization may provide only an object description, not business state.
 *
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless an API's JSDoc states a dispatch or caller-thread limitation.
 */
export {};

declare global {
  /** Public runtime namespaces. */
  const drive: Readonly<AndroidDriveApi>;
  const override: Readonly<AndroidOverrideRuntimeApi>;
  const inspect: Readonly<AndroidInspectApi>;
  const element: Readonly<AndroidElementApi>;
  const common: Readonly<AndroidCommonApi>;

  /** Input operations: IDs/paths resolve in the focused Window; View targets must be attached, shown, and non-empty.
   * Presses use the View center. Coordinates bypass lookup. All events target display 0.
   * drive schedules target resolution on the main thread; callers need no additional dispatch.
   * Failures resolve with ok:false, possibly after partial injection; success means injection accepted,
   * not business completion. The 2000 ms settle delay applies only on success; use wait for readiness.
   */
  interface AndroidDriveApi {
    /**
     * Resolve the target and inject one touchscreen DOWN/UP sequence with a fixed 16 ms press.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     * @example const result = await drive.click(R.id.submit_button);
     */
    click(resourceId: number): Promise<AndroidClickResult>;
    click(path: AndroidUiPath): Promise<AndroidClickResult>;
    click(view: Java.Wrapper): Promise<AndroidClickResult>;
    click(location: AndroidScreenLocation): Promise<AndroidClickResult>;

    /**
     * Resolve the target and inject a fixed 600 ms touchscreen press; no duration parameter.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     * @example const result = await drive.longPress({ x: 120, y: 360 });
     */
    longPress(resourceId: number): Promise<AndroidLongPressResult>;
    longPress(path: AndroidUiPath): Promise<AndroidLongPressResult>;
    longPress(view: Java.Wrapper): Promise<AndroidLongPressResult>;
    longPress(location: AndroidScreenLocation): Promise<AndroidLongPressResult>;

    /**
     * Click the target (16 ms), wait 50 ms, then inject KeyCharacterMap text events through InputManager.
     * text must be non-empty and representable by KeyCharacterMap (arbitrary Unicode may fail).
     * Types into the focused field without clearing its current contents.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     * @example const result = await drive.input(R.id.form_input, "hello");
     */
    input(resourceId: number, text: string): Promise<AndroidTargetInputResult>;
    input(path: AndroidUiPath, text: string): Promise<AndroidTargetInputResult>;
    input(view: Java.Wrapper, text: string): Promise<AndroidTargetInputResult>;
    input(location: AndroidScreenLocation, text: string): Promise<AndroidTargetInputResult>;

    /**
     * Inject a fixed 300 ms finger gesture spanning 60% of the target's visible axis, clamped to display 0.
     * Coordinate targets use the whole display as bounds, centered on the supplied point.
     * direction describes finger movement, not the direction of newly revealed content.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     * @example const result = await drive.scroll(R.id.list, "up");
     */
    scroll(
      resourceId: number,
      direction: AndroidScrollDirection,
    ): Promise<AndroidScrollResult>;
    scroll(
      path: AndroidUiPath,
      direction: AndroidScrollDirection,
    ): Promise<AndroidScrollResult>;
    scroll(
      view: Java.Wrapper,
      direction: AndroidScrollDirection,
    ): Promise<AndroidScrollResult>;
    scroll(
      location: AndroidScreenLocation,
      direction: AndroidScrollDirection,
    ): Promise<AndroidScrollResult>;

    /** Drive UI wait contract.
     * @example const ready = await drive.wait(R.id.submit_button, 'visible');
     * @example const hidden = await drive.wait(['text::Loading'], 'hidden', { timeoutMs: 10000 });
     * IDs/paths are resolved each poll; native Views are checked directly on the main thread.
     * A valid native View satisfies exists even when detached. Coordinates are not accepted.
     */
    wait(
      target: number | AndroidUiPath | Java.Wrapper,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Poll a sync/async boolean predicate sequentially until true. Errors retry until timeout.
     * Invalid return types fail with INVALID_ARGUMENT. Timeout does not cancel an in-flight predicate.
     * @example const ready = await drive.waitUntil(() => cacheReady, { timeoutMs: 10000 });
     */
    waitUntil(predicate: () => boolean | Promise<boolean>, options?: AndroidWaitOptions): Promise<AndroidWaitResult>;
  }
  interface AndroidElementApi {
    /** Resolve an ID or a non-empty path from the focused window on main.
     * Each path step searches the preceding View and its descendants, without backtracking.
     * Missing focus/match returns null; invalid targets throw. Matching does not require visibility.
     * Returns the actual runtime-class Frida wrapper; raw operations retain native thread requirements.
     * @example const view = await element.findUiView(R.id.submit_button);
     * @example const view = await element.findUiView([`id::${R.id.form}`, 'text::Submit']);
     */
    findUiView(target: number | AndroidUiPath): Promise<Java.Wrapper | null>;
  }
  interface AndroidCommonApi {
    /** Schedule work on main; only execution before the first await is guaranteed on main.
     * Returned promises are adopted. Callback errors reject; unavailable Java throws synchronously.
     * Never block waiting for the returned Promise.
     */
    runOnMainThread<T>(work: () => T | Promise<T>): Promise<T>;
    /** Name of the calling thread; null if unnamed or unavailable. No thread dispatch. */
    currentThreadName(): string | null;

  }
  /** Class-wide method selection; constructors unsupported. Supply argumentTypes for ambiguous overloads. */
  interface AndroidMethodDefinition { className: string; method: string; argumentTypes?: readonly string[]; filter?: (...args: any[]) => boolean }
  interface AndroidOverrideRuntimeApi {
    /** Async installation and removal; filter and returnInstead callbacks remain synchronous. When supplied, only literal true passes filter;
     * callback/filter errors are reported and fall back to the original method. Values use Java bridge conversions.
     * Rejects a method with an existing implementation, including an active method watch/override. */
    method(definition: AndroidMethodDefinition, returnInstead: any | ((...args: any[]) => any)): Promise<() => Promise<void>>;
    /** Async installation and removal. Write through Frida Java fields; remove restores the saved value. */
    field(definition: { field: string } & ({ className: string; instance?: never } | { instance: Java.Wrapper; className?: never }), value: any): Promise<() => Promise<void>>;
    /** Async installation; invoke and await the returned closure to remove. */
    code(definition: AndroidCodeDefinition, overrides?: Record<string, any>, earlyReturn?: any): Promise<() => Promise<void>>;
  }
  /** A failed capture may still contain partial data; do not infer absence from incomplete records.
   * Capacity limits or collection errors are reported through error, not thrown by this result type.
   */
  type AndroidInspectResult<T> = { ok: true; data: T[]; error: null } | { ok: false; data: T[]; error: string };
  interface AndroidWatcher<T> {
    /** Cumulative records without draining. After stop, returns ok:false with empty data. */
    current(): Promise<AndroidInspectResult<T>>;
    /** Remove observation and return final cumulative records; repeated calls are supported.
     * Check ok/error for collection or cleanup failures. Does not release caller-owned native values.
     * Method observation does not wait for running business calls to finish.
     */
    stop(): Promise<AndroidInspectResult<T>>;
  }
  interface AndroidLogRecord { timestamp: string; threadId: number; threadName: string | null; tag: string; level: string; message: string }
  interface AndroidMethodEnter { receiver: Java.Wrapper; args: any[] }
  interface AndroidMethodLeave extends AndroidMethodEnter { result: any; exception: any }
  /** Callbacks run synchronously on the intercepted thread. Returned records are not serialized
   * or deep-copied. A JS reference alone does not extend a borrowed native object's lifetime.
   * Prefer copying business values in the callback. To use a Java object later, return a
   * Java.retain(wrapper) reference and call $dispose() when finished. stop() does not dispose it.
   */
  interface AndroidMethodOptions {
    enter?: (context: AndroidMethodEnter) => Record<string, any>;
    leave?: (context: AndroidMethodLeave) => Record<string, any>;
    /** Non-negative safe integer frame limit; omitted or zero disables stack capture. */
    stack?: number;
  }
  interface AndroidMethodFrame { className: string; methodName: string; signature: string; fileName: string | null; lineNumber: number | null }
  interface AndroidMethodRecord {
    callId: number; timestamp: string; threadId: number; threadName: string | null;
    status: "running" | "returned" | "threw"; durationMs: number | null;
    enter?: Record<string, any>; leave?: Record<string, any>; stack?: AndroidMethodFrame[];
  }
  interface AndroidCodeContext { get(name: string): any }
  interface AndroidCodeDefinition { className: string; method: string; argumentTypes?: readonly string[]; fileLine: number; condition?: (context: AndroidCodeContext) => boolean }
  type AndroidCodeCapture = Record<string, string | ((context: AndroidCodeContext) => any)>;
  interface AndroidCodeFrame { className: string; methodName: string; sourceFile: string | null; line: number | null }
  interface AndroidCodeOptions {
    capture?: AndroidCodeCapture;
    /** Integer frame limit in [0, 2147483647]; omitted or zero disables stack capture. */
    stack?: number;
  }
  interface AndroidCodeRecord {
    hitId: string; timestamp: string; threadId: number; threadName: string | null;
    capture?: Record<string, any>; stack?: AndroidCodeFrame[];
  }
  interface AndroidInspectApi {
    ui: AndroidInspectUiApi;
    /** Independent exact TAG subscriptions; no regex. Installation rejects invalid tags.
     * Collection stops accepting records at 10000 records or 2 * 1024 * 1024 UTF-16 text units;
     * current/stop report the capacity error with partial data. Still call stop to remove the subscription.
     */
    log: { watch(tags: string[]): Promise<AndroidWatcher<AndroidLogRecord>> };
    /** Java bridge values; original exceptions are preserved. Rejects an existing implementation,
     * including an active method watch/override. At most 10000 calls; excess calls report a capture error.
     */
    method: { watch(definition: AndroidMethodDefinition, options?: AndroidMethodOptions): Promise<AndroidWatcher<AndroidMethodRecord>> };
    code: { watch(definition: AndroidCodeDefinition, options?: AndroidCodeOptions): Promise<AndroidWatcher<AndroidCodeRecord>> };
  }

  /** UI inspection. All UI methods schedule native access on the main thread.
   */
  interface AndroidInspectUiApi {
    /** Missing target returns false. Native objects refer to the supplied instance. */
    isExisting(target: AndroidInspectUiTarget): Promise<boolean>;
    /** Existing geometric visibility semantics; excludes occlusion. */
    isVisible(target: AndroidInspectUiTarget): Promise<boolean>;
    /** Existing but geometrically invisible; missing targets return false. */
    isHidden(target: AndroidInspectUiTarget): Promise<boolean>;
    /** Target's native input focus, not accessibility focus. */
    isFocused(target: AndroidInspectUiTarget): Promise<boolean>;
    /** Own isEnabled() flag. */
    isEnabled(target: AndroidInspectUiTarget): Promise<boolean>;
    /** Root is depth 0; default 3; integer 0..64. Empty children may mean depth limit.
     * Node targets are Java.cast wrappers managed by bridge GC; optional $dispose() releases them early.
     * @example const root = await inspect.ui.tree(target, 2);
     */
    tree(target: AndroidInspectUiTarget, depth?: number): Promise<AndroidUITreeNode>;
    /** Local bounds in px. Local origin is (0,0). */
    layout(target: AndroidInspectUiTarget): Promise<AndroidUILocalLayout>;
    /** Reference bounds and transformed target AABB in the same coordinate space; no clipping. */
    layoutInParent(target: AndroidInspectUiTarget): Promise<AndroidUIRelativeLayout>;
    layoutInWindow(target: AndroidInspectUiTarget): Promise<AndroidUIRelativeLayout>;
    layoutInScreen(target: AndroidInspectUiTarget): Promise<AndroidUIRelativeLayout>;
    /** Current App window image. Uses the platform window hierarchy renderer. */
    screenshotWindow(): Promise<AndroidUIScreenshot>;
    /** Element image using the existing native window-render-and-crop implementation; no highlight. */
    screenshotElement(target: AndroidInspectUiTarget): Promise<AndroidUIScreenshot>;
    /** Required target; capture its owning window and draw an inward border on Host.
     * Rejects missing targets, missing windows and empty intersection. Preserves App hierarchy.
     */
    /** Dashed stroke: 2 dp using window density. */
    /** highlight defaults to true; false returns the target owning window original. */
    screenshotElementInWindow(target: AndroidInspectUiTarget, highlight?: boolean): Promise<AndroidUIScreenshot>;
  }
  type AndroidInspectUiTarget = number | AndroidUiPath | Java.Wrapper;
  interface AndroidUITreeNode {
    className: string;
    target: Java.Wrapper;
    /** Local bounds in px, captured during traversal. */
    bounds: AndroidUIRect;
    children: AndroidUITreeNode[];
  }
  interface AndroidUIRect { x: number; y: number; width: number; height: number }
  interface AndroidUILocalLayout {
    bounds: AndroidUIRect;
    unit: 'px';
    /** Target Resources DisplayMetrics.density; dp = px / density. */
    density: number;
  }
  interface AndroidUIRelativeLayout extends AndroidUILocalLayout { targetBounds: AndroidUIRect }
  interface AndroidUIScreenshot {
    filePath: string;
    width: number;
    height: number;
    format: 'png' | 'jpeg';
    unit: 'px';
    /** Captured window or element region in screen coordinates. */
    region: AndroidUIRect;
    /** Captured rectangle in window/root coordinates, used for image mapping. */
    sourceBounds: AndroidUIRect;
    /** Actual highlighted rectangle in output image pixels; null for window originals. */
    highlight: AndroidUIRect | null;
    capturedAt: string;
    captureMethod: 'view-draw';
  }

  interface AndroidRuntimeStatus {
    platform: 'android';
    /** Java availability only; does not guarantee UI, input, or bridge readiness. */
    available: boolean;
    appId: string | null;
    /** Native MobileEasyUse integration version, or null when Java is unavailable. */
    releaseVersion: string | null;
  }

  /** Read target-process runtime metadata synchronously. Throws if Java is available but the
   * integration class cannot be loaded. Does not wait for the application to initialize.
   * @example const status = runtimeStatus();
   */
  function runtimeStatus(): AndroidRuntimeStatus;

  /** Runtime IDs from the current application's package via Resources.getIdentifier().
   * Missing resources return 0 (not a valid UI target); unavailable Application throws.
   */
  interface AndroidResourceClass {
    readonly [resourceName: string]: number;
  }

  /** Dynamic, non-enumerable resource lookup; values are IDs, not resolved strings/colors.
   * @example const buttonId = R.id.submit_button;
   */
  interface AndroidR {
    readonly anim: AndroidResourceClass;
    readonly animator: AndroidResourceClass;
    readonly array: AndroidResourceClass;
    readonly attr: AndroidResourceClass;
    readonly bool: AndroidResourceClass;
    readonly color: AndroidResourceClass;
    readonly dimen: AndroidResourceClass;
    readonly drawable: AndroidResourceClass;
    readonly font: AndroidResourceClass;
    readonly fraction: AndroidResourceClass;
    readonly id: AndroidResourceClass;
    readonly integer: AndroidResourceClass;
    readonly interpolator: AndroidResourceClass;
    readonly layout: AndroidResourceClass;
    readonly menu: AndroidResourceClass;
    readonly mipmap: AndroidResourceClass;
    readonly navigation: AndroidResourceClass;
    readonly plurals: AndroidResourceClass;
    readonly raw: AndroidResourceClass;
    readonly string: AndroidResourceClass;
    readonly style: AndroidResourceClass;
    readonly transition: AndroidResourceClass;
    readonly xml: AndroidResourceClass;
    readonly [resourceType: string]: AndroidResourceClass;
  }

  /** id:: requires a positive integer ID; text::, tag:: and class:: require non-empty values.
   * text:: uses Android's text search (may match substrings); tag:: matches a String tag.
   * class:: matches a full runtime class name case-sensitively, including subclasses.
   * Getters must synchronously return a View or null/undefined; Promises are unsupported.
   */
  type AndroidUiPathStep =
    | `id::${number}`
    | `text::${string}`
    | `tag::${string}`
    | `class::${string}`
    | ((root: Java.Wrapper) => Java.Wrapper | null | undefined);

  /** Non-empty path. Each search includes the preceding View itself and its descendants. */
  type AndroidUiPath = readonly [AndroidUiPathStep, ...AndroidUiPathStep[]];

  type AndroidUiState = 'exists' | 'visible' | 'hidden' | 'focused' | 'enabled';

  interface AndroidScreenLocation {
    /** Absolute X in physical pixels on display 0; finite and non-negative. */
    x: number;
    /** Absolute Y in physical pixels on display 0; finite and non-negative. */
    y: number;
  }

  type AndroidInputTargetType = 'id' | 'path' | 'view' | 'location';
  /** Direction of the injected finger gesture; content normally moves in the opposite direction. */
  type AndroidScrollDirection = 'up' | 'down' | 'left' | 'right';

  type AndroidInputErrorCode =
    | 'INVALID_COORDINATES'
    | 'INVALID_ARGUMENT'
    | 'PERMISSION_DENIED'
    | 'INJECTION_REJECTED'
    | 'DISPLAY_UNAVAILABLE'
    | 'FOCUSED_WINDOW_UNAVAILABLE'
    | 'VIEW_NOT_FOUND'
    | 'VIEW_NOT_VISIBLE'
    | 'INVALID_TARGET'
    | 'BACKEND_UNAVAILABLE';

  interface AndroidInputError {
    code: AndroidInputErrorCode;
    message: string;
  }

  interface AndroidInputFailure<
    TAction extends 'click' | 'longPress' | 'scroll' | 'input',
  > {
    ok: false;
    action: TAction;
    error: AndroidInputError;
  }

  interface AndroidClickSuccess {
    ok: true;
    action: 'click';
    x: number;
    y: number;
    displayId: number;
    pressDurationMs: number;
    targetType: AndroidInputTargetType;
    resourceId?: number;
    injectedEvents: 2;
  }

  interface AndroidLongPressSuccess {
    ok: true;
    action: 'longPress';
    x: number;
    y: number;
    displayId: number;
    pressDurationMs: number;
    durationMs: number;
    targetType: AndroidInputTargetType;
    resourceId?: number;
    injectedEvents: 2;
  }

  interface AndroidScrollSuccess {
    ok: true;
    action: 'scroll';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    durationMillis: number;
    displayId: number;
    injectedEvents: number;
    direction: AndroidScrollDirection;
    targetType: AndroidInputTargetType;
    resourceId?: number;
  }

  interface AndroidTargetInputSuccess {
    ok: true;
    action: 'input';
    x: number;
    y: number;
    displayId: number;
    targetType: AndroidInputTargetType;
    resourceId?: number;
    textLength: number;
    injectedEvents: number;
  }

  type AndroidClickResult = AndroidClickSuccess | AndroidInputFailure<'click'>;
  type AndroidLongPressResult = AndroidLongPressSuccess | AndroidInputFailure<'longPress'>;
  type AndroidScrollResult = AndroidScrollSuccess | AndroidInputFailure<'scroll'>;
  type AndroidTargetInputResult = AndroidTargetInputSuccess | AndroidInputFailure<'input'>;

  interface AndroidWaitOptions {
    /** Positive finite timeout in milliseconds, default 5000. Cannot preempt a blocked check. */
    timeoutMs?: number;
    /** Positive finite delay between checks in milliseconds, default 100. First check is immediate. */
    intervalMs?: number;
  }

  type AndroidUiWaitState = AndroidUiState;
  type AndroidWaitErrorCode = 'TIMEOUT' | 'INVALID_ARGUMENT';

  interface AndroidWaitError {
    code: AndroidWaitErrorCode;
    message: string;
    lastCheckError?: string;
  }

  interface AndroidWaitSuccess {
    ok: true;
  }

  interface AndroidWaitFailure {
    ok: false;
    error: AndroidWaitError;
  }

  type AndroidWaitResult = AndroidWaitSuccess | AndroidWaitFailure;

  /** Dynamically resolved Android application resources, for example `R.id.submit_button`. */
  const R: AndroidR;

  const Test: Readonly<AndroidTestApi>;

  type AndroidTestCallback = () => unknown;
  type AndroidTestJsonValue = null | boolean | number | string
    | readonly AndroidTestJsonValue[] | { readonly [key: string]: AndroidTestJsonValue };

  /** Choose assertions by verification target:
   * - UI controls and properties: read with inspect.ui or native access on main, then assert the returned value.
   * - Visual appearance: use screenshot matchers.
   * - Native business objects and state: read primitive values or plain JSON snapshots,
   *   then use general-purpose matchers.
   *
   * Mismatches throw or reject with AssertionError.
   * Await async matchers; none poll. .not inverts comparison results, never input or observation errors.
   */
  interface AndroidTestMatchers {
    readonly not: AndroidTestMatchers;
    /** Compare using Object.is; native wrappers use JavaScript reference identity. */
    toBe(expected: unknown): void;
    /** Structural comparison for acyclic plain JSON objects, arrays and primitive values.
     * Object key order is ignored; array order matters. Only own enumerable string keys are compared.
     * Native objects, Date, Map, Set and cyclic graphs are unsupported; inputs are not validated.
     */
    toEqual(expected: AndroidTestJsonValue): void;
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
     * @example await Test.create().expect(123).toMatchElementScreenshot('/absolute/baseline.png');
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

  interface AndroidTestExpect {
    /** Create matchers for an actual value or UI target; message prefixes assertion failures. */
    (actual?: unknown, message?: string): AndroidTestMatchers;
  }

  type AndroidTestSelection = { describe?: undefined; test?: undefined }
    | { describe: string; test?: string };

  interface AndroidTestReference {
    describe: string;
    test: string;
  }

  interface AndroidTestFailure {
    phase: 'beforeEach' | 'test' | 'afterEach';
    name: string;
    message: string;
    stack: string;
    matcher?: string;
    /** Display strings, not native object references. */
    actual?: string;
    expected?: string;
  }

  interface AndroidTestResult extends AndroidTestReference {
    status: 'passed' | 'failed' | 'notRun';
    durationMs: number;
    errors: AndroidTestFailure[];
  }

  interface AndroidTestReport {
    ok: boolean;
    total: number;
    passed: number;
    failed: number;
    notRun: number;
    tests: AndroidTestResult[];
  }

  interface AndroidTestCollection {
    /** Register a non-nested group with a unique name; callback must be synchronous registration only.
     * An uncaught registration error discards the group.
     */
    describe(name: string, register: () => void): void;
    /** Register inside describe with a unique name; return or await all asynchronous work.
     * Return values do not determine success. Throw, reject or use expect to fail.
     */
    test(name: string, callback: AndroidTestCallback): void;
    /** Group-local hooks run in declaration order before every selected test. */
    beforeEach(callback: AndroidTestCallback): void;
    /** All cleanup hooks are attempted in declaration order, even after setup/body failure.
     * Cleanup must tolerate partial setup. Cleanup failures fail the test without replacing earlier errors.
     */
    afterEach(callback: AndroidTestCallback): void;
    readonly expect: AndroidTestExpect;
    /** List registered test names in declaration order. */
    list(): AndroidTestReference[];
    /** Run all with no selection or {}; otherwise select a describe or a describe+test pair.
     * Invalid selections or no matching tests reject. Runs serially; after failure, remaining tests are notRun.
     * While running, registration and concurrent/nested runs across collections are rejected.
     * Test failures resolve with a report; check report.ok. Collections can run again after completion.
     */
    run(selection?: AndroidTestSelection): Promise<AndroidTestReport>;
  }

  interface AndroidTestApi {
    /** Create an independent test collection.
     * @example const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
     */
    create(): AndroidTestCollection;
  }
}
