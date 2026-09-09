/// <reference types="frida-gum" />

/**
 * Canonical API contract for generating Android probe scripts. Read this file alone for SDK usage.
 *
 * This file is documentation and code-generation context only. It is not
 * loaded into Frida. Load the built `android.js` once in the shared Bootstrap runtime
 * before loading business ES Modules that use the global Java, R, AndroidExp,
 * Override, Probe, and runtimeStatus APIs. These are globals, not imports from this file.
 * Load only this platform declaration; Android and iOS globals belong to separate runtimes.
 * Probe modules should export functions and perform actions when called, not at module load.
 * Await asynchronous SDK calls and check result.ok before relying on an action or wait.
 * Return JSON-serializable values to the Host; convert Java wrappers to plain values first.
 *
 * Public SDK APIs are callable from any thread; their implementations own required platform-thread
 * dispatch unless an API's JSDoc states a dispatch or caller-thread limitation.
 */
export {};

declare global {
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

  type ProbeJsonPrimitive = string | number | boolean | null;
  type ProbeJsonValue =
    | ProbeJsonPrimitive
    | readonly ProbeJsonValue[]
    | { readonly [key: string]: ProbeJsonValue };

  /** Runtime IDs from the current application's package via Resources.getIdentifier().
   * Missing resources return 0 (not a valid UI target); unavailable Application throws.
   */
  interface AndroidResourceClass {
    readonly [resourceName: string]: number;
  }

  /** Dynamic, non-enumerable resource lookup; values are IDs, not resolved strings/colors.
   * @example const buttonId = R.id.search_button;
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

  interface AndroidWindowApi {
    /** Return all WindowManagerGlobal roots in framework order, including unfocused/popup roots.
     * Returns [] when none exist; Java/framework lookup errors throw. Wrappers are cast to View.
     * Synchronous Java VM attachment only; no main-thread dispatch or visibility filtering.
     * @example const roots = await AndroidExp.runOnMainThread(() => AndroidExp.window.getRootViews());
     */
    getRootViews(): Java.Wrapper[];
  }

  /** id:: requires a positive integer ID; text:: and tag:: require non-empty values.
   * text:: uses Android's text search (may match substrings); tag:: matches a String tag.
   * Getters must synchronously return a View or null/undefined; Promises are unsupported.
   */
  type AndroidUiPathStep =
    | `id::${number}`
    | `text::${string}`
    | `tag::${string}`
    | ((root: Java.Wrapper) => Java.Wrapper | null | undefined);

  /** Non-empty path. Each search includes the preceding View itself and its descendants. */
  type AndroidUiPath = readonly [AndroidUiPathStep, ...AndroidUiPathStep[]];

  /** Non-empty map of non-empty Evidence keys to focused-Window UI paths; raw IDs/Views are not accepted. */
  interface ProbeUiTargets {
    readonly [uiKey: string]: AndroidUiPath;
  }

  /** Synchronous queries attach to the Java VM without main-thread dispatch. For consistent UI
   * reads, call through AndroidExp.runOnMainThread. Raw methods on returned wrappers retain
   * Android's own thread requirements; getters run on the querying thread.
   */
  interface AndroidUiApi {
    /**
     * Find a View by resource ID from the focused Window root. The returned Wrapper uses the
     * View's actual runtime class. Java object results returned by its methods lazily promote to
     * their runtime wrapper when a member is absent from Frida's declared-type wrapper.
     * Requires a positive integer. Missing focus/match returns null; invalid targets throw.
     * @example const view = await AndroidExp.runOnMainThread(() => AndroidExp.ui.find(R.id.search_button));
     */
    find(resourceId: number): Java.Wrapper | null;
    /**
     * Find a View by applying each native Android id/text/tag/getter step below the preceding View.
     * The first getter receives the focused Window root. A text step uses the first View returned by
     * View.findViewsWithText() when multiple Views match. Each getter receives the preceding View
     * wrapped as its actual runtime class, and the returned Wrapper preserves the final runtime class.
     * Java object results returned by its methods use the same lazy runtime-wrapper promotion.
     * Missing focus/step returns null; invalid paths or getters throw. Matching does not require visibility.
     * @example const view = await AndroidExp.runOnMainThread(() => AndroidExp.ui.find([`id::${R.id.form}`, 'text::Search']));
     */
    find(path: AndroidUiPath): Java.Wrapper | null;
  }

  /** View targets must belong to the focused App Window; IDs/paths are resolved within that Window. */
  type AndroidScreenshotTarget = number | AndroidUiPath | Java.Wrapper;

  interface AndroidScreenshotOptions {
    /** Optional non-empty keys mapped to elements cropped from the captured App Window. */
    targets?: Readonly<Record<string, AndroidScreenshotTarget>>;
    /** Defaults to false with non-empty targets. An absent/empty target map always captures the window. */
    includeWindow?: boolean;
  }

  type AndroidScreenshotResult =
    /** Successful values are Host JPEG paths. Unresolved/non-croppable targets are omitted, even when ok is true. */
    | { ok: true; window?: string; targets: Readonly<Partial<Record<string, string>>> }
    | { ok: false; error: { message: string }; targets: Readonly<Partial<Record<string, never>>> };

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

  /** IDs/paths resolve in the focused Window; View targets must be attached, shown, and non-empty.
   * Presses use the View center. Coordinates bypass lookup. All events target display 0.
   * Target resolution reads Views on the invoking thread; use runOnMainThread for that phase.
   * Failures resolve with ok:false, possibly after partial injection; success means injection accepted,
   * not business completion. The 2000 ms settle delay applies only on success; use wait for readiness.
   */
  interface AndroidInputApi {
    /**
     * Resolve the target and inject one touchscreen DOWN/UP sequence with a fixed 16 ms press.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     * @example const result = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(R.id.search_button));
     */
    click(resourceId: number): Promise<AndroidClickResult>;
    click(path: AndroidUiPath): Promise<AndroidClickResult>;
    click(view: Java.Wrapper): Promise<AndroidClickResult>;
    click(location: AndroidScreenLocation): Promise<AndroidClickResult>;

    /**
     * Resolve the target and inject a fixed 600 ms touchscreen press; no duration parameter.
     * Injects asynchronously, then waits a fixed 2000 ms after the terminal event before resolving.
     * @example const result = await AndroidExp.input.longPress({ x: 120, y: 360 });
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
     * @example const result = await AndroidExp.runOnMainThread(() => AndroidExp.input.input(R.id.search_input, "hello"));
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
     * @example const result = await AndroidExp.runOnMainThread(() => AndroidExp.input.scroll(R.id.list, "up"));
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
    /** Positive finite timeout in milliseconds, default 5000. Cannot preempt a blocked check. */
    timeoutMs?: number;
    /** Positive finite delay between checks in milliseconds, default 100. First check is immediate. */
    intervalMs?: number;
  }

  /** exist: found and attached. visible: attached, isShown(), positive width/height.
   * gone: absent or not visible (not necessarily removed). No occlusion/hit-test check.
   * For ID/path targets, no focused Window keeps waiting even for gone.
   */
  type AndroidUiWaitState = 'exist' | 'visible' | 'gone';
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
    /** Re-resolve a positive resource ID on the main thread until the state matches.
     * Resolves ok:false for invalid arguments or timeout; check exceptions are retried and reported
     * as lastCheckError on timeout. Success contains no View; use ui.find if needed.
     * @example const ready = await AndroidExp.wait.ui(R.id.search_button, 'visible');
     */
    ui(
      resourceId: number,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Re-resolve the path on the main thread each check; uses the same result/error contract as ID waits.
     * @example const gone = await AndroidExp.wait.ui(['text::Loading'], 'gone', { timeoutMs: 10000 });
     */
    ui(
      path: AndroidUiPath,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Check this View instance on the main thread; does not re-resolve a replacement View.
     * Uses the same result/error contract as ID waits.
     * @example if (view) { const ready = await AndroidExp.wait.ui(view, 'visible'); }
     */
    ui(
      view: Java.Wrapper,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Poll a synchronous boolean predicate without main-thread dispatch. Async predicates are invalid.
     * Throwing checks are retried; timeout includes lastCheckError. Returns ok:false on timeout or
     * invalid arguments. Do not access thread-confined UI directly here; use wait.ui for UI state.
     * @example const ready = await AndroidExp.wait.until(() => cacheReady, { timeoutMs: 10000 });
     */
    until(predicate: () => boolean, options?: AndroidWaitOptions): Promise<AndroidWaitResult>;
  }

  interface AndroidExpApi {
    /** Schedule work on Android's main thread. Only the synchronous part before the first await
     * is guaranteed to run there; a returned Promise is adopted, not kept on the main thread.
     * Callback errors reject; unavailable Java throws synchronously. Never block waiting for this Promise.
     * @example const title = await AndroidExp.runOnMainThread(() => AndroidExp.ui.find(R.id.title)?.getText().toString() ?? null);
     */
    runOnMainThread<TResult>(work: () => TResult | Promise<TResult>): Promise<TResult>;
    /** Capture the focused App Window, keyed element crops, or both; requires the native screenshot bridge
     * and Host file controller. Resolves ok:false for invalid options, capture, or persistence errors.
     * Missing/hidden/out-of-window targets can be omitted on success; check each requested key.
     * @example const shot = await AndroidExp.screenshot({ targets: { submit: R.id.search_button }, includeWindow: true });
     */
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

  /** Must match the selected Java return type: primitives, null/Java objects, or compatible arrays.
   * Plain JSON objects are not converted to Java objects; use Java wrappers. undefined is for void.
   */
  type AndroidOverrideReturnValue =
    | ProbeJsonPrimitive
    | Int64
    | readonly AndroidOverrideReturnValue[]
    | Java.Wrapper
    | undefined;

  interface AndroidOverrideDefinition<
    TValue extends AndroidOverrideReturnValue = AndroidOverrideReturnValue,
  > {
    /** Java class name or class wrapper containing the target method. */
    target: string | Java.Wrapper;
    method: string;
    /** Exact Java type names (e.g. java.lang.String, int); [] selects no arguments. Exclusive with allOverloads. Optional for one overload. */
    argumentTypes?: readonly string[];
    /** Explicitly select every overload of a multiply overloaded method. */
    allOverloads?: boolean;
    /** Runs on the intercepted thread; only literal true applies withReturn.
     * False or a thrown error calls the original; thrown errors are reported. Must be synchronous/read-only.
     */
    filter?: (invocation: AndroidOverrideInvocation) => boolean;
    /** Replacement result or synchronous factory on the intercepted thread; skips the original on success.
     * Factory errors are reported and fall back to the original. Return-type conversion errors are not
     * covered by that fallback. Match every selected overload's return type; no Promise factories.
     */
    withReturn: TValue | ((invocation: AndroidOverrideInvocation) => TValue);
  }

  interface AndroidOverrideApi {
    /** Install a non-empty definition list, call action, and restore after synchronous return/throw or
     * settlement of a native JS Promise. Custom thenables do not extend the scope; use async action.
     * Installation errors roll back and throw before action. Action results/errors are preserved.
     * Overrides are process-wide while active, including unrelated threads; use filter to narrow scope.
     * Already-hooked overloads (including chain evidence/other overrides) are rejected.
     * @example const result = Override.run([{ target: 'com.example.Flags', method: 'isEnabled', withReturn: true }], () => Java.use('com.example.Flags').isEnabled());
     */
    run<TResult>(
      definitions: readonly AndroidOverrideDefinition[],
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
    /** Synchronous, read-only extraction at entry; return finite, acyclic plain JSON only. */
    args?: (invocation: ProbeHookInvocation) => ProbeJsonValue;
    /** Synchronous, read-only extraction on normal return only; never on throw. Same JSON restrictions as args. */
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
    /** Java class name or class wrapper; hooks all matching instances during the action scope. */
    target: string | Java.Wrapper;
    method: string;
    /** Exact Java type names (e.g. java.lang.String, int); [] selects no arguments. Exclusive with allOverloads. Optional for one overload. */
    argumentTypes?: readonly string[];
    /** Explicitly select every overload of a multiply overloaded method. */
    allOverloads?: boolean;
    /** Runs on the intercepted thread; keep only literal true. False/throw skips capture and preserves the original call. Must be synchronous/read-only. */
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

  /** Synchronous, read-only getters on the current JS thread, keyed by state path. Return plain JSON. */
  type ProbeStateGetters = Readonly<Record<string, () => ProbeJsonValue>>;

  interface ProbeEvidenceApi {
    /** Capture selected Java methods and exact-TAG liblog messages during action.
     * Await action and remove hooks on completion or failure; return its result or propagate its error.
     * Records are written to Evidence. Method/log events include threadName (null when unavailable).
     * Supports multiple TAGs per call; at most one log-capture scope may be active (including nesting).
     * Hooks observe all matching process calls, including unrelated concurrent work; use filter.
     * Already-hooked Java overloads are rejected. Setup errors roll back and reject before action.
     * Callbacks execute on intercepted threads and must be synchronous. Empty hooks plus no TAG capture nothing.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     * @param logTag Exact TAG or TAG set; omit for method-only capture.
     * @param methodHooks Methods to observe; omit for log-only capture.
     * @example const result = await Probe.evidence.withChainEvidence(() => AndroidExp.input.click({ x: 120, y: 360 }), 'Submit search', 'Search');
     */
    withChainEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      logTag?: string | Set<string>,
      methodHooks?: readonly ProbeChainMethodHook[],
    ): Promise<Awaited<TResult>>;

    /** Capture each state getter before `action` and again in `finally`; await and return action's result
     * or propagate its error. Values go to Evidence, not the return value. An empty map records nothing.
     * Getter errors are reported without stopping other getters or action. Getters are never awaited or
     * dispatched to the main thread; use JSON primitives/arrays/plain objects, not runtime wrappers.
     * @example let count = 0; await Probe.evidence.withStateEvidence(() => ++count, 'Increment', { count: () => count });
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     */
    withStateEvidence<TResult>(
      action: () => TResult,
      actionDescription: string,
      stateGetters: ProbeStateGetters,
    ): Promise<Awaited<TResult>>;

    /** Capture keyed UI state plus App-window and visible element screenshots before and after action,
     * including an after checkpoint on action failure. Non-empty key-to-path map required.
     * Re-resolves paths on the main thread; invalid targets reject before action. Per-target query errors
     * are reported/skipped; screenshot failure yields null image paths. UI and images are separate reads.
     * Evidence includes className, exist, visible, pixel bounds, empty properties, and screenshot paths.
     * Returns awaited action result (not snapshots), propagates action error; finalizer errors are reported.
     * @example await Probe.evidence.withUiEvidence(() => AndroidExp.input.click({ x: 120, y: 360 }), 'Submit', { submit: [`id::${R.id.search_button}`] });
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

}
