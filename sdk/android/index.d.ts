/// <reference types="frida-gum" />

/**
 * Type declarations for the mobile-easy-use Android runtime SDK.
 *
 * This file is documentation and code-generation context only. It is not
 * loaded into Frida. Load the built `android.js` once in the shared Bootstrap runtime
 * before loading business ES Modules that use the global Java, R, AndroidExp,
 * and Probe APIs.
 *
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless a method JSDoc states a caller-thread requirement.
 */
export {};

declare global {
  type ProbeJsonPrimitive = string | number | boolean | null;
  type ProbeJsonValue =
    | ProbeJsonPrimitive
    | readonly ProbeJsonValue[]
    | { readonly [key: string]: ProbeJsonValue };

  /** Runtime resource IDs resolved through Android Resources.getIdentifier(). Missing resources return 0. */
  interface AndroidResourceClass {
    readonly [resourceName: string]: number;
  }

  /** Dynamic Android application resources matching the `R.type.name` access shape. */
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

  interface AndroidWindowApi {
    /** Return WindowManagerGlobal root Views, including possible popup roots. */
    getRootViews(): Java.Wrapper[];
  }

  type AndroidUiPathStep =
    | `id::${number}`
    | `text::${string}`
    | `tag::${string}`
    | ((root: Java.Wrapper) => Java.Wrapper | null | undefined);

  /** Each step searches below the View returned by the preceding step. */
  type AndroidUiPath = readonly [AndroidUiPathStep, ...AndroidUiPathStep[]];

  /** Stable Evidence keys mapped to focused-Window UI paths. */
  interface ProbeUiTargets {
    readonly [uiKey: string]: AndroidUiPath;
  }

  type AndroidUiState = 'exists' | 'visible' | 'hidden' | 'focused' | 'enabled';

  interface AndroidUiApi {
    /**
     * Find a View by resource ID from the focused Window root. The returned Wrapper uses the
     * View's actual runtime class. Java object results returned by its methods lazily promote to
     * their runtime wrapper when a member is absent from Frida's declared-type wrapper.
     */
    find(resourceId: number): Java.Wrapper | null;
    /**
     * Find a View by applying each native Android id/text/tag/getter step below the preceding View.
     * The first getter receives the focused Window root. A text step uses the first View returned by
     * View.findViewsWithText() when multiple Views match. Each getter receives the preceding View
     * wrapped as its actual runtime class, and the returned Wrapper preserves the final runtime class.
     * Java object results returned by its methods use the same lazy runtime-wrapper promotion.
     */
    find(path: AndroidUiPath): Java.Wrapper | null;
    /** Resolve and check once on the main thread; no polling. Missing targets return false for every state.
     * exists means a View was resolved; hidden requires an existing, geometrically invisible View.
     * visible checks attachment, visibility, ancestor alpha > 0.01 and clipped visible display bounds,
     * not occlusion or masks. focused/enabled use isFocused()/isEnabled(). Lookup/getter errors reject.
     */
    checkUiState(target: number | AndroidUiPath, state: AndroidUiState): Promise<boolean>;
  }

  type AndroidScreenshotTarget = number | AndroidUiPath | Java.Wrapper;

  interface AndroidScreenshotOptions {
    /** Optional keyed elements cropped from the captured App Window. */
    targets?: Readonly<Record<string, AndroidScreenshotTarget>>;
    /** Also return the App Window when targets are provided. Defaults to false. */
    includeWindow?: boolean;
  }

  type AndroidScreenshotResult =
    /** Successful values are Host image paths. */
    | { ok: true; window?: string; targets: Readonly<Record<string, string>> }
    | { ok: false; error: { message: string }; targets: {} };

  interface AndroidScreenLocation {
    /** Absolute physical display X coordinate. */
    x: number;
    /** Absolute physical display Y coordinate. */
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

  interface AndroidInputApi {
    /**
     * Resolve the target and inject one touchscreen DOWN/UP sequence.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     */
    click(resourceId: number): Promise<AndroidClickResult>;
    click(path: AndroidUiPath): Promise<AndroidClickResult>;
    click(view: Java.Wrapper): Promise<AndroidClickResult>;
    click(location: AndroidScreenLocation): Promise<AndroidClickResult>;

    /**
     * Resolve the target and inject a long touchscreen press.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     */
    longPress(resourceId: number): Promise<AndroidLongPressResult>;
    longPress(path: AndroidUiPath): Promise<AndroidLongPressResult>;
    longPress(view: Java.Wrapper): Promise<AndroidLongPressResult>;
    longPress(location: AndroidScreenLocation): Promise<AndroidLongPressResult>;

    /**
     * Click the target, then inject KeyCharacterMap text events through InputManager.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     */
    input(resourceId: number, text: string): Promise<AndroidTargetInputResult>;
    input(path: AndroidUiPath, text: string): Promise<AndroidTargetInputResult>;
    input(view: Java.Wrapper, text: string): Promise<AndroidTargetInputResult>;
    input(location: AndroidScreenLocation, text: string): Promise<AndroidTargetInputResult>;

    /**
     * Inject a bounded directional gesture.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
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
  }

  interface AndroidWaitOptions {
    /** Maximum wait time in milliseconds. Defaults to 5000. */
    timeoutMs?: number;
    /** Delay between checks in milliseconds. Defaults to 100. */
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

  interface AndroidWaitApi {
    /** Poll ui.checkUiState with wait.until. hidden requires an existing, invisible View.
     * No focused Window resolves as missing. Geometry matches expect, not pixel-level visibility.
     * Lookup errors, including invalid targets, retry until TIMEOUT with lastCheckError.
     */
    ui(
      resourceId: number,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Re-resolve a native Android UI path until it reaches the requested state. */
    ui(
      path: AndroidUiPath,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Poll a sync/async boolean predicate sequentially until true. Errors retry until timeout.
     * Invalid return types fail with INVALID_ARGUMENT. Timeout does not cancel an in-flight predicate.
     */
    until(predicate: () => boolean | Promise<boolean>, options?: AndroidWaitOptions): Promise<AndroidWaitResult>;
  }

  interface AndroidExpApi {
    /** Run work on Android's main thread and resolve with its result. */
    runOnMainThread<TResult>(work: () => TResult | Promise<TResult>): Promise<TResult>;
    /** Capture the focused App Window, keyed element crops, or both. */
    screenshot(options?: AndroidScreenshotOptions): Promise<AndroidScreenshotResult>;
    readonly window: AndroidWindowApi;
    readonly ui: AndroidUiApi;
    readonly input: AndroidInputApi;
    readonly wait: AndroidWaitApi;
  }

  interface AndroidOverrideInvocation {
    receiver: Java.Wrapper;
    args: readonly unknown[];
    argumentTypes: readonly string[];
  }

  type AndroidOverrideReturnValue =
    | ProbeJsonValue
    | Java.Wrapper
    | undefined;

  interface AndroidOverrideDefinition<
    TValue extends AndroidOverrideReturnValue = AndroidOverrideReturnValue,
  > {
    /** Java class name or class wrapper containing the target method. */
    target: string | Java.Wrapper;
    method: string;
    /** Select one exact overload. Optional when the method has one overload. */
    argumentTypes?: readonly string[];
    /** Explicitly select every overload of a multiply overloaded method. */
    allOverloads?: boolean;
    /** Apply withReturn only when this synchronous, read-only callback returns true. */
    filter?: (invocation: AndroidOverrideInvocation) => boolean;
    /** Replacement result or synchronous replacement-result factory. The original method is skipped. */
    withReturn: TValue | ((invocation: AndroidOverrideInvocation) => TValue);
  }

  type AndroidOverrideFieldValue = boolean | number | string | Int64 | Java.Wrapper | unknown[] | null;

  /**
   * Write once before action and restore the original value afterward; App writes are not blocked.
   * Use stable configuration or flow-control fields. Avoid fields the App changes during action:
   * restoration overwrites those changes. Do not overlap operations on the same field.
   * Field access uses the runtime thread; fields requiring a specific App thread are unsupported.
   */
  interface AndroidOverrideFieldDefinition {
    /** Instance wrapper for instance fields; class name or wrapper for static fields. */
    target: string | Java.Wrapper;
    /** Exact Frida field name (use _name for a method-name collision). */
    field: string;
    /** Native-compatible fixed value; use Int64 for large longs and Java.array() for native arrays. */
    withValue: AndroidOverrideFieldValue;
  }

  interface AndroidOverrideApi {
    /**
     * Install methods or write fields before action; restore in reverse order after return, throw or Promise settlement.
     * Installation failure rolls back earlier definitions without running action.
     * @param definitions Method and field definitions, optionally mixed.
     * @param action Trigger and required completion wait; return or await all dependent asynchronous work.
     * @returns The action result or Promise, preserving its outcome.
     */
    run<TResult, TValue extends AndroidOverrideReturnValue = AndroidOverrideReturnValue>(
      definitions: readonly (AndroidOverrideDefinition<TValue> | AndroidOverrideFieldDefinition)[],
      action: () => TResult,
    ): TResult extends Promise<infer TResolved> ? Promise<TResolved> : TResult;
  }

  interface ProbeHookInvocation {
    receiver: Java.Wrapper;
    args: readonly unknown[];
    argumentTypes: readonly string[];
  }

  type AndroidChainMemoryMetric = 'javaHeapUsedBytes' | 'nativeHeapAllocatedBytes';

  interface ProbeChainCapture {
    /** Default off. true or {} captures the entry stack with at most 5 frames.
     * maxFrames must be an integer from 1 to 64; actual stacks may be shorter.
     * Emits capture.stack {kind: 'java', frames: [...]} on enter only.
     * Java frames contain className, methodName, signature, fileName and lineNumber.
     * @example stack: true // or stack: {maxFrames: 3}
     */
    stack?: boolean | { maxFrames?: number };
    /** Synchronous, read-only extraction at entry; returns data serialized as JSON. */
    args?: (invocation: ProbeHookInvocation) => ProbeJsonValue;
    /** Synchronous, read-only extraction on normal return only; never on throw. */
    result?: (invocation: ProbeHookInvocation & { result: unknown }) => ProbeJsonValue;
    /** Default off. Emits elapsedMs in fractional milliseconds, measured with a monotonic clock.
     * Includes children/waits; not CPU time or async completion time.
     */
    timing?: boolean;
    /** Default off. Read each selected process metric before/after; no polling or forced GC.
     * Deltas include concurrent work/GC and do not measure this method's allocations or leaks.
     */
    memory?: {
      /** Non-empty selection; unsupported names are rejected before the action runs. */
      metrics: readonly AndroidChainMemoryMetric[];
    };
  }

  interface ProbeChainMethodHook {
    target: string | Java.Wrapper;
    method: string;
    /** Select one exact overload. Optional when the method has one overload. */
    argumentTypes?: string[];
    /** Explicitly select every overload of a multiply overloaded method. */
    allOverloads?: boolean;
    /** Keep evidence only for matching invocations; must be synchronous and read-only. */
    filter?: (invocation: ProbeHookInvocation) => boolean;
    /** Optional method data: args/stack on enter; timing/memory on leave/throw; result on leave only.
     * Writes to Evidence; the action result is unchanged. Omit to record execution only.
     * Invalid configuration rejects before the action. Collection failures preserve business behavior
     * and emit captureErrors [{field,message}]; failed fields are omitted, failed memory readings/deltas are null.
     * Memory output: memory[metric] {unit:'bytes',before,after,delta}.
     * Nested probes add overhead to parent timings; keep capture selective.
     * @example capture: { stack: true, timing: true }
     */
    capture?: ProbeChainCapture;
  }

  type ProbeStateGetters = Readonly<Record<string, () => ProbeJsonValue | Promise<ProbeJsonValue>>>;

  interface ProbeEvidenceApi {
    /** Capture selected Java methods and exact-TAG liblog messages during action.
     * Await action and remove hooks on completion or failure; return its result or propagate its error.
     * Records are written to Evidence. Method events include actual argumentTypes on enter/leave/throw.
     * Method/log events include threadName (null when unavailable).
     * Supports multiple TAGs per call;
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     * @param logTag Exact TAG or TAG set; omit for method-only capture.
     * @param methodHooks Methods to observe; omit for log-only capture.
     * @example await Probe.evidence.withChainEvidence(action, 'Submit search', 'Search', methodHooks);
     */
    withChainEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      logTag?: string | Set<string>,
      methodHooks?: readonly ProbeChainMethodHook[],
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
      stateGetters: ProbeStateGetters,
    ): Promise<Awaited<TResult>>;

    /** Capture keyed UI state plus App-window and visible element screenshots before and after.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     */
    withUiEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      uiTargets: ProbeUiTargets,
    ): Promise<Awaited<TResult>>;
  }

  interface ProbeApi {
    readonly evidence: ProbeEvidenceApi;
  }

  /** Dynamically resolved Android application resources, for example `R.id.search_button`. */
  const R: AndroidR;

  /** Android UI helpers, waits, and controlled input extensions. */
  const AndroidExp: Readonly<AndroidExpApi>;

  /** Action-scoped Java method return overrides. */
  const Override: Readonly<AndroidOverrideApi>;

  /** Action-scoped chain, state, and UI evidence capture. */
  const Probe: Readonly<ProbeApi>;

  const Test: Readonly<AndroidTestApi>;

  type AndroidTestCallback = () => unknown;
  type AndroidTestJsonValue = null | boolean | number | string
    | readonly AndroidTestJsonValue[] | { readonly [key: string]: AndroidTestJsonValue };

  /** Mismatches throw or reject with AssertionError.
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
    /** Target exists. UI state assertions resolve via AndroidExp.ui.find once on the main thread.
     * Targets: resource ID or UI path.
     * Missing targets fail all five positive UI state assertions, including toBeHidden.
     */
    toExist(): Promise<void>;
    /** Attached, not hidden, cumulative ancestor alpha > 0.01, with nonempty clipped screen bounds.
     * Uses getGlobalVisibleRect and the window's visible display frame.
     * Excludes occlusion, masks and presentation-layer animation geometry.
     */
    toBeVisible(): Promise<void>;
    /** UI target exists but is not geometrically visible. Missing is not hidden. */
    toBeHidden(): Promise<void>;
    /** Target itself has input focus via isFocused(). Not accessibility focus. */
    toBeFocused(): Promise<void>;
    /** Native isEnabled(), not necessarily clickable. */
    toBeEnabled(): Promise<void>;
    /** Resolve once and invoke a read-only predicate on the main thread; await its boolean result.
     * After await, native UI access must explicitly use AndroidExp.runOnMainThread.
     * Missing targets and non-boolean results are errors.
     */
    toSatisfy(predicate: (view: Java.Wrapper) => boolean | Promise<boolean>): Promise<void>;
    /** Compare existing PNG/JPEG files on Host. Actual and baseline must be absolute Host paths.
     * No capture, baseline updates or diff images. Color threshold is 0.2; anti-alias differences are ignored.
     * Size mismatch fails; file/decoding/transport errors propagate.
     */
    toHaveScreenshot(baselinePath: string, options?: {
      /** Allowed differing pixel ratio in [0, 1], inclusive. Defaults to 0. */
      maxDiffPixelRatio?: number;
    }): Promise<void>;
  }

  interface AndroidTestExpect {
    /** Create matchers for an actual value or UI target; message prefixes assertion failures. */
    (actual: unknown, message?: string): AndroidTestMatchers;
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
