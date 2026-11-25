# ApiDemo ordinary probe migration

Ordinary SDK probes are retired in favor of real simulator E2E scripts under each App's `tests/`. This migration does not change SDK implementation or native App sources. The E2E shell installs configured prebuilt Apps and builds current SDK JavaScript.

## Decisions

| Removed probe directories | Current regression coverage / decision |
| --- | --- |
| Both `runtime` | `tests/common/runtime.js`: runtime identity and class discovery. A Promise resolved and compared within one script is not a Host roundtrip test; Host protocol tests remain in `test/mcp`. |
| Both `wait` | `tests/drive/wait.js` and `wait-transitions.js`: immediate/delayed visibility, attach/detach, resizing, timeout and predicates. Android function steps inside UI paths remain supported by the current SDK; their E2E coverage is still pending. |
| Both `screenshot` | `tests/inspect/ui.js`, `visual-element.js`, `visual-window.js`: current screenshot APIs and reviewed fixed baselines. Retire legacy screenshot result schemas. |
| Android `resource` | `tests/element/resources.js`: compiled IDs/strings, missing resources and subsequent successful lookup. |
| Both `ui` | `tests/element/query.js`, `class-click.js`, `class-query.js`: native identity, exact and inherited classes, self steps, case sensitivity, no backtracking or subtree escape, hidden lookup, invalid empty class. |
| Both `input` | Existing `tests/drive/click.js`, `input.js` plus `input-boundaries.js`. Android adds rejected hidden/zero/detached targets with no native events, and held DOWN/UP duration with no short click. iOS adds Unicode append and A/B/A focus switching, UIView touches rather than accessibility activation, clipped/covered element versus raw-coordinate behavior, duplicate identifiers. |
| Android `window` | `tests/element/windows.js`: dialog/focusable popup roots and recovery, non-focusable popup retaining activity focus, and no query root while backgrounded. Public query behavior replaces removed root-list introspection. |
| Both `override` | Existing `tests/override` exercise current method/field/code contracts. Android field tests additionally protect independent instances, arrays and null restoration. Retire `Override.run` scoped cleanup, all-overload selection and direct iOS ivar contracts. Current method overrides still report callback/filter errors and call the original method; this behavior needs public-entry E2E coverage. |

The iOS `tests/drive/windows.js` suite retains window-order and visibility-transition checks and adds covered-window rejection for input, long press and scroll, with native state unchanged.

## Scope boundaries

This is a migration of useful behavior, not a copy of the historical 96-case iOS input Cartesian matrix. Target forms already have basic click coverage; the migration does not claim every target form crossed with every gesture, direction, distance and window mode. Historical physical-device results are not transferred to current simulator tests. Simulator passes do not establish physical-device compatibility.

The historical input matrix's full combinations (including extreme-distance scroll clamping and every target form for custom long-press durations) are not claimed as covered by this migration. Likewise the removed field probes' complete historical type matrix is not claimed; current field, method and code tests protect their own documented cases.

Retained, untouched scripts:

- Both `probe/presets`: real-App preset smoke checks, separate from ordinary SDK regression.

## Validation

Run relevant suites with `node test/e2e/run.mjs --platform android|ios --suite <suite>`.
2026-11-24, configured prebuilt ApiDemo artifacts; no native rebuild:

| Platform | Suite | Passed | Report |
| --- | --- | ---: | --- |
| Android 12 | element | 15 | [report](../../artifacts/e2e/2026-11-24T08-47-43.012Z-android-89978/report.json) |
| Android 12 | element/windows, rerun after adding background coverage | 4 | [report](../../artifacts/e2e/2026-11-24T08-49-29.510Z-android-92309/report.json) |
| Android 12 | drive/input-boundaries | 2 | [report](../../artifacts/e2e/2026-11-24T08-48-26.600Z-android-91010/report.json) |
| Android 12 | override/field | 7 | [report](../../artifacts/e2e/2026-11-24T08-49-18.974Z-android-91956/report.json) |
| iOS 26.0.1 | element | 10 | [report](../../artifacts/e2e/2026-11-24T08-48-46.784Z-ios-91360/report.json) |
| iOS 26.0.1 | drive/input-boundaries | 7 | [report](../../artifacts/e2e/2026-11-24T08-47-35.146Z-ios-89764/report.json) |
| iOS 26.0.1 | drive/windows | 11 | [report](../../artifacts/e2e/2026-11-24T08-49-29.364Z-ios-92262/report.json) |

All selected runs passed with no unexecuted tests. Android has 25 distinct tested cases (three window cases were rerun); iOS has 28. These are targeted migration checks, not a run of the full SDK suite. Reports are local generated artifacts.


## Debugger investigations: second migration

Removed `probe/debugger-bridge` and `probe/jvmti-debugger`, including their independent runners, prototype native agent and historical result files. These demonstrated alternative backend feasibility rather than exercising the current SDK. Native App fixture classes remain: `DebuggerReadTypesFixture` still uses `JvmtiDebuggerFixture.Box`, and the retained agent-loading checks also use `JvmtiDebuggerFixture`.

`probe/debugger-read-types` moved to `tests/inspect/code-read-types.js`. Four Test cases cover static/instance methods and arguments/locals; each observes five native calls. The matrix preserves integer and char boundaries, precise wide integers, special floating-point values including negative zero, Unicode strings, boxed objects, object field/method access, all eight primitive array kinds, reference/nested/empty/null arrays. Direct captures and callback reads are checked through actual Frida values, without the legacy `snapshot` serialization contract. Java completion and hit count are checked independently of watcher records.

The embedded source marker must match the installed prebuilt App, as with the other debugger E2E suites. The existing omission of embedded NUL **strings** remains; NUL **char** is tested. No claim is made that a previous NUL-string limitation has been fixed.

Deleted `no-locals.init.gradle` and `strip-locals.py`, and removed their invocation from the retained agent-loading build script. Those tools modified `DebuggerNoLocalsFixture`, but neither remaining runner exercised that class. This was build work without corresponding behavior coverage, not a migrated no-locals test. The production SDK and native App source are unchanged.

Validation: Android 12 Emulator, configured prebuilt ApiDemo, **4 passed / 0 failed / 0 not run**, covering 20 native breakpoint hits. [Report](../../artifacts/e2e/2026-11-24T09-33-12.314Z-android-14717/report.json). JavaScript/shell syntax and `git diff --check` passed. The retained two-mode APK packaging build was not rerun; its only change removes the unrelated no-locals init script.


## Default APK packaging

ApiDemo no longer sets `packaging.jniLibs.useLegacyPackaging`; with its minSdk 24, AGP defaults to uncompressed native libraries. Rebuilt `:app:assembleAutoDebug` successfully without refreshing dependencies. ZIP inspection confirmed `libmobile_easy_use_native.so` is stored uncompressed for all four packaged ABIs; the packaged manifest has `extractNativeLibs=false`.

Removed `probe/debugger-agent-loading` after validating this artifact through existing debugger E2E. No separate two-mode packaging matrix remains in the regular test setup. Historical notes recorded both extracted and APK-backed loading passing on Android 12 physical hardware and Android 16 Emulator; those are historical results, not a fresh two-mode run or a guarantee for every device.

Current Android 12 Emulator: `common/debugger` **5 passed**, including real breakpoint callbacks, concurrent hits and script unload/reconnect with native behavior restored and a fresh watcher working. [Report](../../artifacts/e2e/2026-11-24T12-22-20.332Z-android-91885/report.json). This validates the default APK-backed agent loading path through the production SDK.

The same default-packaging artifact also passed all **4** `inspect/code-read-types` cases (20 native hits), covering argument/local reads in static/instance methods. [Report](../../artifacts/e2e/2026-11-24T12-22-32.030Z-android-92363/report.json). No SDK implementation changes were needed.


## Static method regression

Removed Android `probe/evidence` (static-resolution/static-matrix scripts, declarations and historical results). The public behavior regression now lives in `tests/override/method-static.js` and reuses the dedicated `StaticResolutionFixture` already present in ApiDemo. No other App code references this fixture, and the test does not access it before installing `override.method`.

The test checks the first Java call-site invocation receives the replacement without executing the original body, a filter miss invokes the original exactly once while the override remains installed, and removal restores the Java call site. Native body counts and replacement counts are asserted independently. It does not recreate the historical 19-method/device matrix or claim to reproduce every ART initialization failure.

Run `node test/e2e/run.mjs --platform android --suite override/method-static`. The standard Android shell force-stops the App before connecting, giving a fresh process even with `--reuse-app`; do not manually rerun this cold-fixture case in the same process. The fixture's initial call count assertion rejects reuse after its original method has executed.

Android 12 Emulator: **1 passed / 0 failed / 0 not run**. [Report](../../artifacts/e2e/2026-11-24T12-25-21.391Z-android-94553/report.json). Uses the previously rebuilt default-packaging APK; no native source or SDK implementation change was required. Simulator success is a public-contract regression result, not renewed certification of historical physical-device behavior.
