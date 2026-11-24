# Debugger E2E migration

Debugger behavior is verified in Android Emulator / iOS Simulator ApiDemo, not a desktop substitute runtime. Internal APIs stay internal. `tests/common/debugger/` imports the platform debugger implementation; `tests/inspect/code.js` and `tests/override/code.js` exercise the corresponding public contracts. Test/expect is the real SDK test framework throughout.

## Entry points

```sh
npm run test:e2e -- --platform android --suite common/debugger --timeout 180000 --report-limit 50
npm run test:e2e -- --platform ios --suite common/debugger --timeout 240000 --report-limit 50
npm run test:e2e -- --platform android --suite inspect/code
npm run test:e2e -- --platform android --suite override/code
npm run test:e2e -- --platform ios --suite inspect/code
npm run test:e2e -- --platform ios --suite override/code
```

A suite can name a file or directory. To isolate a regression without changing assertions:

```sh
npm run test:e2e -- --platform ios --suite common/debugger/index \
  --describe 'LLDB debugger' --test 'swift reads locals, expressions and bounded source frames'
```

E2E installs the artifacts in `test/e2e/config.json`; it does not build native Apps. Rebuild after modifying the fixtures. Android uses `DebuggerMvpFixture.java`, already included in AutoDebug. iOS uses `APIDebuggerFixture.m` and `APIDebuggerSwiftFixture.swift`, included in ProbeDebug with debug symbols and optimization disabled.

```sh
fixtures/android/ApiDemo/gradlew -p fixtures/android/ApiDemo :app:assembleAutoDebug
cd fixtures/ios/ApiDemo
xcodebuild -workspace ApiDemo.xcworkspace -scheme ApiDemo -configuration ProbeDebug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath .derived-data build
```

The bundler embeds fixture source as text. Helpers resolve unique `BP_*` markers to lines; iOS Host paths use the repository root supplied by the bundler. The embedded source must match the installed artifact. Tests trigger native business methods asynchronously, without driving UI or blocking the thread needed for debugger callbacks. App results and body/finally counters independently verify mutations and early returns.

## Coverage mapping

| Previous coverage | E2E destination / decision |
| --- | --- |
| Android debugger stage ordering and early return after writes | `override/code.js`: read → write → return, checked against caller result |
| Condition false/errors | Android public inspect/override condition tests; iOS native condition and condition-error tests |
| Partial capture/write failures | Android public inspect partial captures and override incompatible values; iOS partial expression failures |
| Java stack and emitting thread | Android `inspect/code.js` bounded stack and worker-name assertions |
| Hit-local get lifetime | Android public inspect/override get reuse/expiration; `inspect/code.js` wrapper lifetime after stop |
| Java primitive conversion | Android `override/code.js`: boolean, byte, char, short, int, long > JS safe range, float, negative-zero double, Unicode string/null |
| Arrays and nested arrays | Android `override/code.js`: primitive arrays, String arrays and int matrix; native caller observes contents |
| Receiver, argument, local and field lookup | Android `override/code.js` Counter instance scope and object-return tests |
| Concurrent callbacks and repeated stop | Android four Java workers, exact unique hits, shared stop result |
| Same-position breakpoints and conditions | Both platforms independent subscriptions and removal; iOS keeps native SetCondition |
| LLDB source frames and expressions | Objective-C and Swift capture/expression/stack cases |
| LLDB native return ABI | `common/debugger/early-return.js`: int, double, BOOL, long long, NSString, nil, Swift Int and void; actual caller values, not just LLDB error status |
| Stop and restoration | Both bottom-layer suites and public `override/code.js` |
| current / cached final result / copy isolation | Both public `inspect/code.js` suites |
| Default metadata and partial records | Both public inspect suites, plus bottom-layer partial errors |
| Capacity exhaustion | Android public inspect executes 10001 native calls and checks 10000 records and a failure result |
| Android unload cleanup | `common/debugger/unload.lifecycle.js`: active override and watcher → direct SDK unload → reconnect in the same process → original native result and a working new watcher |
| iOS unload detach | iOS lifecycle fixture: active override → direct SDK script unload → wait for Host LLDB close → reconnect → original result |
| Process identity across cleanup | Host rejects lifecycle verification if reconnect changed the PID |
| Symbol config / Host attach selection / disconnect error handling | Keep Host cases in `test/mcp/ios-debugger.test.js` |
| Worker dispatch / capacity / symbol loading | Dispatch and capacity use ApiDemo E2E; symbol configuration uses `test/mcp/ios_debugger_sources_test.py`. Removed synthetic unsafe-frame/callback fault injection; see [SDK migration](sdk-test-migration.md) for boundaries. |
| Artificial JVMTI error codes, unsupported synthetic descriptors, wrapper disposal call counts, forced nested callback scheduling | Retire implementation-detail mocks. Actual conversion, invalid operations, concurrency, completion, cleanup and native results are the E2E contracts; no claim of forced native fault coverage |
| SDK transport retry simulated by replacing requestController | Remove SDK mock harness; Host communication/error tests remain separate. Device E2E does not claim deterministic network-failure coverage |

## Lifecycle execution

Files ending in `.lifecycle.js` export `arm()`, `pid()` and ordinary Test `run()`. `arm` must verify the active effect and return `{ armed: true, pid }`. Host performs normal disconnect by default; Either platform may request `cleanup: 'script-unload'` to unload the SDK directly; iOS additionally waits for the Host LLDB session to close. The fresh runtime verifies unchanged PID and restored native behavior. Installation alone is never accepted as evidence of a working override.

## Migration does not mean all platform behavior passes

Known iOS early-return problems were previously observed only in a macOS host. Their new App tests retain correct expected return values; they are neither skipped nor changed to accept wrong values. Any failing conditions/returns must remain visible in the E2E report. `Test.run` stops after a failed case, so use named selection to investigate other cases in a fresh session.

Only behavior covered above is claimed. Destructive debugger failure injection and remote-device compatibility are not implied by simulator results.

## Simulator validation — 2026-11-19

Android completed **41 passing tests**: 36 internal/lifecycle tests, 4 public inspect tests and 1 public override test. Reports:

- [Internal debugger and disconnect cleanup](../../artifacts/e2e/2026-11-19T11-52-52.280Z-android-58285/report.json)
- [inspect.code](../../artifacts/e2e/2026-11-19T11-50-44.041Z-android-54436/report.json)
- [override.code](../../artifacts/e2e/2026-11-19T11-49-24.257Z-android-52442/report.json)

iOS was rebuilt in ProbeDebug and tested on iPhone 17 / iOS 26.0.1. Separate runs passed Objective-C / Swift capture, writes, partial expression errors, Swift condition rejection, same-location conditional dispatch, condition-error handling, stop/restoration, public inspect and public override. These individual successes do **not** establish that the combined suite passes. Three failures remain visible:

1. **Same-session condition evaluation:** capture expressions, stop, then install a conditional breakpoint at the same location. LLDB reports a missing Foundation module map and an undeclared `price`; the regression expects successful condition evaluation and fails. [Report](../../artifacts/e2e/2026-11-19T11-55-21.094Z-ios-60820/report.json). This is reproducible with the named `native conditions remain valid after expression capture in the same session` test.
2. **Direct SDK script unload:** `sdkScript.unload()` exceeds 15 seconds, followed by disconnect timeout. This does not establish successful detach or restoration. [Report](../../artifacts/e2e/2026-11-19T11-53-56.530Z-ios-59604/report.json).
3. **Early-return execution:** the initial aggregate matrix lost its script/connection before producing a Test report. After splitting by type, the suite reports **1 passed (int), 1 failed (double), 6 not run**. Double fails with `No older frame to return to`; this combined-session result does not establish whether double also fails in isolation. [Report](../../artifacts/e2e/2026-11-19T11-56-29.710Z-ios-63046/report.json). The int case also passed independently. Unexecuted types are not counted as passing.

The retained Host tests passed: 4 JavaScript tests and 16 Python tests. Reports under `artifacts/` are local generated evidence, not committed fixtures. The migration changes test coverage and execution; it does not claim to fix the above platform failures.

## Follow-up — 2026-11-20

The three failures above were investigated. The initial Stop/add/remove/Continue workaround was later rejected during root-cause review: compiling a new Python callback while running implicitly populated a stale frame cache. The final approach prepares a shared named callback during attach and reuses it on new breakpoints, without explicit Stop/Continue around add/remove. The SDK no longer exports dispose: Android drains all breakpoint registrations through its shared bindWeak cleanup; iOS closes LLDB on Host destroyed/detached events and before normal disconnect. Detailed evidence, source references and remaining limitations are in [iOS debugger root causes](ios-debugger-root-causes.md).

The complete 13-case internal suite, direct-unload lifecycle, isolated int→double transition regression, 2 public inspect cases and 1 public override case passed. Android disconnect cleanup and the 27 framework tests also passed. The typed early-return matrix progressed through all 6 Objective-C value cases; Swift Int still returns an incorrect value, a separate previously known ABI limitation. The full return matrix is not green.

## Unified cleanup validation — 2026-11-20

SDK `dispose` has been removed. Android `inspect.code` and `override.code` share the registration owner in `common/debugger/index.js`; explicit removal and `Script.bindWeak` use the same close/drain/dispose path. The former internal `stopDebuggers()` test is replaced by lifecycle coverage that leaves both an override and a watcher installed, unloads the SDK, and verifies native behavior plus a fresh watcher in the same process. iOS keeps Host-owned detach before normal unload and on destroyed/detached notifications, with concurrent close requests sharing one task.

Current SDK JS with the configured prebuilt Apps passed:

- Android internal debugger and unload: **35 tests**, [report](../../artifacts/e2e/2026-11-20T06-32-48.530Z-android-89240/report.json).
- Android inspect.code: **4 tests**, [report](../../artifacts/e2e/2026-11-20T06-33-19.549Z-android-90145/report.json).
- Android override.code: **1 test**, [report](../../artifacts/e2e/2026-11-20T06-33-42.305Z-android-90737/report.json).
- iOS direct script unload: **1 test**, [report](../../artifacts/e2e/2026-11-20T06-32-50.232Z-ios-89391/report.json).
- iOS internal debugger: **13 tests**, [report](../../artifacts/e2e/2026-11-20T06-34-01.003Z-ios-91330/report.json).
- Host connection, process lifecycle and LLDB session tests: **48 passed**.

No native rebuild was needed. This cleanup validation does not rerun or resolve the separate Swift early-return ABI limitation described above.

## Android resource/behavior split — 2026-11-20

`common/debugger/index.js` now exports only `registerBreakpoint`: callback lifetime, native registration, explicit removal and unload cleanup. `debuggerProbe` and its `install` path are removed. `inspect.code` and `override.code` each own their onHit/onFinish logic; override no longer carries unused observations/stack collection.

Tests now follow that boundary. The common suite directly exercises callback ordering, peer removal, concurrent completion, failed registration recovery and script unload. Capture contracts live in inspect; conditions, variable writes, primitive/object/array conversion and early returns live in override. Legacy standalone read probes use inspect.code and serialize captures at their RPC boundary.

Android Emulator with the configured prebuilt App passed **44 tests**:

- Resource and unload tests: **5**, [report](../../artifacts/e2e/2026-11-20T07-02-37.730Z-android-15737/report.json).
- inspect.code: **9**, [report](../../artifacts/e2e/2026-11-20T07-03-04.186Z-android-16290/report.json).
- override.code: **30**, [report](../../artifacts/e2e/2026-11-20T07-02-19.782Z-android-15086/report.json).

This change does not modify iOS or native debugger code. Standalone legacy probes were updated and syntax-checked, not rerun.
