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

  interface AndroidWindowApi {
    /** Return all WindowManagerGlobal roots in framework order, including unfocused/popup roots.
     * Returns [] when none exist; Java/framework lookup errors throw. Wrappers are cast to View.
     * Synchronous Java VM attachment only; no main-thread dispatch or visibility filtering.
     * @example const roots = await AndroidExp.runOnMainThread(() => AndroidExp.window.getRootViews());
     */
    getRootViews(): Java.Wrapper[];
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

  /** Non-empty map of non-empty Evidence keys to focused-Window UI paths; raw IDs/Views are not accepted. */
  interface ProbeUiTargets {
    readonly [uiKey: string]: AndroidUiPath;
  }

  type AndroidUiState = 'exists' | 'visible' | 'hidden' | 'focused' | 'enabled';

  /** Synchronous find queries attach to the Java VM without main-thread dispatch. For consistent UI
   * reads, call through AndroidExp.runOnMainThread. Raw methods on returned wrappers retain
   * Android's own thread requirements; getters run on the querying thread.
   */
  interface AndroidUiApi {
    /**
     * Find a View by resource ID from the focused Window root. The returned Wrapper uses the
     * View's actual runtime class. Java object results returned by its methods lazily promote to
     * their runtime wrapper when a member is absent from Frida's declared-type wrapper.
     * Requires a positive integer. Missing focus/match returns null; invalid targets throw.
     * @example const view = await AndroidExp.runOnMainThread(() => AndroidExp.ui.find(R.id.submit_button));
     */
    find(resourceId: number): Java.Wrapper | null;
    /**
     * Find a View by applying each id/text/tag/class/getter step below the preceding View, without backtracking.
     * The first getter receives the focused Window root. A text step uses the first View returned by
     * View.findViewsWithText() when multiple Views match. Each getter receives the preceding View
     * wrapped as its actual runtime class, and the returned Wrapper preserves the final runtime class.
     * Java object results returned by its methods use the same lazy runtime-wrapper promotion.
     * Missing focus/step returns null; invalid paths or getters throw. Matching does not require visibility.
     * @example const view = await AndroidExp.runOnMainThread(() => AndroidExp.ui.find([`id::${R.id.form}`, 'text::Submit']));
     */
    find(path: AndroidUiPath): Java.Wrapper | null;
    /** Resolve and check once on the main thread; no polling. Missing targets return false for every state.
     * exists means a View was resolved; hidden requires an existing, geometrically invisible View.
     * visible checks attachment, visibility, ancestor alpha > 0.01 and clipped visible display bounds,
     * not occlusion or masks. focused/enabled use isFocused()/isEnabled(). Lookup/getter errors reject.
     */
    checkUiState(target: number | AndroidUiPath, state: AndroidUiState): Promise<boolean>;
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
     * @example const result = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(R.id.submit_button));
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
     * @example const result = await AndroidExp.runOnMainThread(() => AndroidExp.input.input(R.id.form_input, "hello"));
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
     * @example const ready = await AndroidExp.wait.ui(R.id.submit_button, 'visible');
     */
    ui(
      resourceId: number,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Re-resolve the path on the main thread each check; uses the same result/error contract as ID waits.
     * @example const hidden = await AndroidExp.wait.ui(['text::Loading'], 'hidden', { timeoutMs: 10000 });
     */
    ui(
      path: AndroidUiPath,
      state: AndroidUiWaitState,
      options?: AndroidWaitOptions,
    ): Promise<AndroidWaitResult>;

    /** Poll a sync/async boolean predicate sequentially until true. Errors retry until timeout.
     * Invalid return types fail with INVALID_ARGUMENT. Timeout does not cancel an in-flight predicate.
     * @example const ready = await AndroidExp.wait.until(() => cacheReady, { timeoutMs: 10000 });
     */
    until(predicate: () => boolean | Promise<boolean>, options?: AndroidWaitOptions): Promise<AndroidWaitResult>;
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
     * @example const shot = await AndroidExp.screenshot({ targets: { submit: R.id.submit_button }, includeWindow: true });
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
    /** Install a non-empty list of method or field definitions, call action, and restore in reverse order after return/throw or
     * settlement of a native JS Promise. Custom thenables do not extend the scope; use async action.
     * Installation errors roll back and throw before action. Action results/errors are preserved.
     * Overrides are process-wide while active, including unrelated threads; use filter to narrow scope.
     * Already-hooked overloads (including chain evidence/other overrides) are rejected.
     * On ARM Android 11+, static-hook setup initializes the declaring class and completes ART visibility;
     * if the ART symbol is unavailable, setup warns and continues without this preparation. Class initialization may run App code.
     * @example const result = Override.run([{ target: 'com.example.Flags', method: 'isEnabled', withReturn: true }], () => Java.use('com.example.Flags').isEnabled());
     */
    run<TResult>(
      definitions: readonly (AndroidOverrideDefinition | AndroidOverrideFieldDefinition)[],
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

  /** Read-only getters keyed by state path; await each result and return plain JSON. */
  type ProbeStateGetters = Readonly<Record<string, () => ProbeJsonValue | Promise<ProbeJsonValue>>>;

  interface ProbeEvidenceApi {
    /** Capture selected Java methods and exact-TAG liblog messages during action.
     * Await action and remove hooks on completion or failure; return its result or propagate its error.
     * Records are written to Evidence. Method events include actual argumentTypes on enter/leave/throw. Method/log events include threadName (null when unavailable).
     * Supports multiple TAGs per call; at most one log-capture scope may be active (including nesting).
     * Hooks observe all matching process calls, including unrelated concurrent work; use filter.
     * Already-hooked Java overloads are rejected. Setup errors roll back and reject before action.
     * On ARM Android 11+, static-hook setup initializes the declaring class and completes ART visibility;
     * if the ART symbol is unavailable, setup warns and continues without this preparation. Class initialization may run App code.
     * Callbacks execute on intercepted threads and must be synchronous. Empty hooks plus no TAG capture nothing.
     * @param action Trigger the action and await its required completion before returning.
     * @param actionDescription Non-empty sole aggregation key within the operation; unique per action
     * execution, shared only by wrappers observing that same execution.
     * @param logTag Exact TAG or TAG set; omit for method-only capture.
     * @param methodHooks Methods to observe; omit for log-only capture.
     * @example const result = await Probe.evidence.withChainEvidence(() => AndroidExp.input.click({ x: 120, y: 360 }), 'Submit form', 'Form');
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
     * An empty map records nothing. Values go to Evidence, not the return value.
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
     * @example await Probe.evidence.withUiEvidence(() => AndroidExp.input.click({ x: 120, y: 360 }), 'Submit', { submit: [`id::${R.id.submit_button}`] });
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

  /** Available during synchronous processing of the current breakpoint hit.
   * Looks up the current frame and receiver's instance fields; no implicit closure/outer-instance lookup.
   */
  interface AndroidDebuggerContext {
    /** Read a name in the current frame: local/parameter first, then an instance field.
     * `this` reads the receiver directly. Member paths/expressions are not accepted.
     * Missing debug information, ambiguous or unavailable variables are errors.
     * Actual Java Strings become JS strings; other objects are live Frida wrappers.
     * Each call reads fresh values. Saved get functions cannot be used after the hit finishes.
     */
    get(name: string): any;
  }

  type AndroidDebuggerCallback<T = unknown> = (context: AndroidDebuggerContext) => T;
  type AndroidDebuggerValue = boolean | number | string | Int64 | Java.Wrapper | null | undefined;
  type AndroidDebuggerValueSource = AndroidDebuggerValue | AndroidDebuggerCallback<AndroidDebuggerValue>;

  interface AndroidDebuggerDefinition {
    breakpoint: {
      /** Java class name or Frida wrapper. Requires a debuggable Android API 28+ app and the SDK AAR. */
      target: string | Java.Wrapper;
      /** Exact runtime method name. Constructors/class initializers are unsupported.
       * Kotlin inline/SMAP and coroutine logical-frame reconstruction are unsupported.
       */
      method: string;
      /** Required for ambiguous overloads. Matches the complete runtime parameter list in order.
       * Include extra parameters: Continuation for Kotlin suspend, the receiver for extensions,
       * and Composer/masks for @Composable. If selection fails, inspect the runtime overloads
       * and supply their exact types; the SDK does not add parameters automatically.
       */
      argumentTypes?: readonly string[];
      /** Positive source line in this method. Installs its smallest jlocation; no nearest-line fallback. */
      fileLine: number;
      /** False excludes the hit. Errors are recorded and skip all configured stages. */
      condition?: AndroidDebuggerCallback<boolean>;
    };
    /** Keys name output values; strings name variables, functions compute values using get(name).
     * Runs before overrides. Each failed item is omitted and diagnosed in errors; other items continue.
     * No ordering/dependency guarantee between items in the same stage.
     */
    observations?: Readonly<Record<string, string | AndroidDebuggerCallback>>;
    /** Keys name writable locals/parameters or instance fields, resolved exactly as get(name).
     * Values are literals (including literal strings) or synchronous callbacks returning a value.
     * Cannot replace this. Types must be assignment-compatible; integral values are range checked.
     * char is one UTF-16 code unit; long accepts Int64 or a safe integer; JS string becomes Java String.
     * Runs after observations, with no dependency guarantee between entries.
     * Failed items do not prevent other writes; completed writes are not rolled back.
     * Failures do not suppress earlyReturn. Callback values are computed before resolving the write target.
     */
    overrides?: Readonly<Record<string, AndroidDebuggerValueSource>>;
    /** Literal or synchronous callback; get reads values after overrides. Presence requests a return;
     * omit this property for normal continuation. For void use () => undefined.
     * Native return runs after JS exits, skipping remaining method code INCLUDING finally.
     * Failures appear in errors, including deferred native failures; success adds no output value.
     */
    earlyReturn?: AndroidDebuggerValueSource;
    /** Maximum Java stack frames, positive 32-bit integer. Omitted means no stack collection.
     * Captured after condition, before observations/overrides; starts at the target method.
     * No native/JS frames or reconstructed inline/coroutine stack.
     */
    stack?: number;
  }

  interface AndroidDebuggerStackFrame {
    className: string;
    methodName: string;
    sourceFile: string | null;
    line: number | null;
  }

  interface AndroidDebuggerError {
    stage: 'condition' | 'observations' | 'overrides' | 'earlyReturn' | 'stack' | 'framework';
    /** Output key for observations; target variable name for overrides. */
    name?: string;
    message: string;
  }

  interface AndroidDebuggerHit {
    hitId: string;
    /** ISO timestamp at callback entry. */
    timestamp: string;
    thread: { id: string; name: string | null };
    /** Direct snapshots, no status/value envelope. Failed keys are omitted; null is a valid value. */
    observations?: Record<string, ProbeJsonValue>;
    /** Omitted when not requested or collection failed. */
    stack?: AndroidDebuggerStackFrame[];
    /** Omitted when there are no failures. Successful writes/returns add no result fields. */
    errors?: AndroidDebuggerError[];
  }

  /** Clears the breakpoint, drains entered callbacks, releases its environment, and returns raw hit records.
   * Repeated successful calls share one Promise/result. Close/dispose failures propagate directly without hits;
   * subsequent cleanup steps are skipped on failure. If the native environment remains alive, cleanup can be retried.
   * No detach or rollback.
   * Data is buffered in memory until stop, with no sampling/truncation/summaries. Return the array from a probe
   * module export to transport it to Host through normal RPC; no separate file mode or background persistence.
   * Await stop in finally before unloading a script. Normal MCP disconnect stops active debuggers first;
   * abrupt Host/network/process termination does not guarantee result delivery or cleanup.
   */
  type AndroidDebuggerStop = () => Promise<AndroidDebuggerHit[]>;

  interface ProbeApi {
    /** Install a persistent ART/JVMTI line breakpoint; return async stop and raw hit records.
     * All data/control stages are optional, including a registration with only breakpoint or stack.
     * Stages: condition → stack → observations → overrides → earlyReturn → resume.
     * Callbacks run synchronously on the hit thread. No async/generators, Promise/iterator results,
     * Host waits, main-thread dispatch-and-wait, or debugger registration/stop inside callbacks.
     * Other App threads continue running. Recursive hits on the same thread are skipped.
     * Java wrappers are temporary and live, not snapshots; use Java.retain explicitly to retain them.
     * User JS/Java calls can have side effects; no stage or failure rolls them back.
     * Returned data is copied: long/nonfinite/undefined use tags, Java objects use class summaries.
     * Cycles and unsupported JS objects fail the observation. No automatic field expansion.
     * Configuration must not change until stop completes. Blocking callbacks cannot be cancelled.
     * @example
     * const stop = await Probe.debugger({
     *   breakpoint: { target: 'com.example.Counter', method: 'update', fileLine: 42 },
     *   observations: { before: 'count', field: ({get}) => get('this').count.value },
     *   overrides: { count: 10 },
     *   earlyReturn: ({get}) => get('count'),
     *   stack: 3,
     * });
     * try { await triggerBusinessOperation(); } finally { await stop(); }
     * return await stop();
     */
    debugger(definition: AndroidDebuggerDefinition): Promise<AndroidDebuggerStop>;
    readonly evidence: ProbeEvidenceApi;
  }

  /** Dynamically resolved Android application resources, for example `R.id.submit_button`. */
  const R: AndroidR;

  /** Android UI helpers, waits, and controlled input extensions. */
  const AndroidExp: Readonly<AndroidExpApi>;

  /** Action-scoped Java method return overrides. */
  const Override: Readonly<AndroidOverrideApi>;

  /** Android debugger observations and action-scoped chain, state, and UI evidence capture. */
  const Probe: Readonly<ProbeApi>;

  const Test: Readonly<AndroidTestApi>;

  type AndroidTestCallback = () => unknown;
  type AndroidTestJsonValue = null | boolean | number | string
    | readonly AndroidTestJsonValue[] | { readonly [key: string]: AndroidTestJsonValue };

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
    /** Capture the current element through AndroidExp.screenshot, then compare on Host.
     * Use expect(target); baselinePath points to an existing Host PNG/JPEG.
     * Relative paths resolve against the call_function entry module directory; Inline requires an absolute path.
     * Handles platform thread dispatch internally. No baseline updates or diff images.
     * Color threshold is 0.2; anti-alias differences are ignored. Size mismatch fails.
     * On mismatch, AssertionError actual/expected contain the captured/baseline Host paths.
     * Capture, missing-image, file/decoding/transport errors propagate, including under .not.
     * @example await Test.create().expect(123).toHaveElementScreenShot('/absolute/baseline.png');
     */
    toHaveElementScreenShot(baselinePath: string, options?: {
      /** Allowed differing pixel ratio in [0, 1], inclusive. Defaults to 0. */
      maxDiffPixelRatio?: number;
    }): Promise<void>;
    /** Capture the current window through AndroidExp.screenshot, then compare on Host.
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
