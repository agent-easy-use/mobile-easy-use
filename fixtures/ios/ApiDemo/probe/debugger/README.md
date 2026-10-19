# iOS debugger API fixture

This suite runs the public `Probe.debugger` API against the real ApiDemo App.
It works with a simulator or a development-signed device; macOS command-line
fixtures in `test/fixtures` are a separate suite.

## Design

- OC and Swift methods expose parameters, an addressable local, properties and
  representative snapshot values. Source markers determine breakpoint lines.
- The App schedules work asynchronously and publishes a completion flag and
  caller-side results. The harness waits for completion with a deadline, not a
  fixed delay. No XCTest input Runner is needed.
- Each case attaches a debugger, registers a breakpoint, triggers native code,
  collects records with stop, checks actual native results, and detaches.
- `cases.js` defines API expectations. Known failures are failures: no expected
  failure exemptions, type adapters, register fixes or special unwind flags.
- The harness loads the built SDK and uses the production Runtime Loader,
  Controller and LLDB Worker. It does not mock debugger behavior.
- A simulator case failure resets the App before proceeding. Device recovery
  uses the loader's normal launch-if-absent behavior; an unresponsive device App
  may require manual termination. Subsequent setup failures are reported.

## Coverage

For both OC and Swift: source breakpoints, true/false/error conditions,
observations and individual errors, stack limits/omission, local/property
writes, independent override errors, scalar/Void earlyReturn, return after
successful/failed overrides, and invalid return expressions.

Additional cases cover an OC implementation-address breakpoint and lifecycle:
registration before attach, concurrent/repeated attach, concurrent/repeated
stop, no further records after stop, detach before collection, repeated detach,
and reattach. Multiple native invocations verify persistent breakpoints.

Snapshots cover numbers, booleans, Unicode strings, nil and object summaries.
The suite deliberately does not enumerate every Swift ABI type, compiler flag,
OS version or symbol-discovery layout. Those remain separate investigations.

## Build and install

Run from the repository root, with Xcode and CocoaPods dependencies available:

```bash
npm run build:ios
xcodebuild -workspace fixtures/ios/ApiDemo/ApiDemo.xcworkspace \
  -scheme ApiDemo -configuration ProbeDebug \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  -derivedDataPath fixtures/ios/ApiDemo/.derived-data build
xcrun simctl install <simulator-udid> \
  fixtures/ios/ApiDemo/.derived-data/Build/Products/ProbeDebug-iphonesimulator/ApiDemo.app
node fixtures/ios/ApiDemo/probe/debugger/run.mjs simulator <simulator-udid>
```

Use the default ProbeDebug settings; do not override `ENABLE_DEBUG_DYLIB` or
`DEBUG_INFORMATION_FORMAT` for this suite. The command above includes Xcode's
`ApiDemo.debug.dylib` layout. LLDB discovers local build symbols automatically;
there is no main-executable line-table requirement and no debugger plist.
For CI builds, configure `ios.debugger.dsymPaths` in the working project's
`.meu/config.json`; relative paths resolve from that file's directory. See the
[root README](../../../../../README.md#ios-debugger-symbols). Attach returns
`symbolLoadErrors` for failed entries and continues loading subsequent entries.

Use a booted simulator. Do not attach Xcode's debugger simultaneously. The loader
launches the App if necessary, loads the embedded runtime, and detaches before
our debugger attaches. Build from this local checkout without moving sources.

For a device, follow the ApiDemo README to build/install with development signing
and forward the runtime port; then run:

```bash
node fixtures/ios/ApiDemo/probe/debugger/run.mjs device <coredevice-id> 127.0.0.1:28484
```

An optional final argument filters case names, for example `swift/earlyReturn`.

## Results

`artifacts/benchmarks/ios-debugger/result.json` records target/device information,
Xcode/LLDB versions, native results, hit records and assertion failures. Each case
also records its execution `phase`:

- `not-run`: Runtime/SDK preparation (`runtime`) or the ordinary case's debugger
  attachment (`attach`) prevented execution.
- `failed`: breakpoint registration, native execution, record collection,
  verification or detach failed after setup. The lifecycle case tests attach and
  detach themselves, so errors in its `lifecycle` phase are failures.
- `passed`: execution and detach completed (`complete`).

The process exits nonzero if any case failed or could not run. A passing API error
case means the expected error was observed, not that errors were ignored.
Filtered runs write `filtered-result.json` and preserve the full-suite result.

## Simulator verification — 2026-10-19

Environment: iPhone 17 simulator, iOS 26.0.1, arm64; Xcode 26.0 (17A324),
Apple LLDB 1703.0.31.2. The App was built, installed and launched with the default
ProbeDebug configuration, without command-line build-setting overrides or explicit
symbol paths. **28 executed, 25 passed, 3 failed, 0 not-run**.

- Attach returned `{ "symbolLoadErrors": [] }`; LLDB discovered local symbols.
- Failures: `swift/earlyReturn-value`, `swift/earlyReturn-after-overrides`,
  `swift/earlyReturn-after-override-error`. Expected caller values were 42, 25,
  42; the caller received an incorrect large integer. These remain failures and
  the suite exits with status 1.
- OC cases, Swift observations/overrides/conditions, both Void returns, address
  breakpoints and lifecycle assertions passed.
- Physical-device execution is still pending. Simulator results do not imply
  physical-device success or support for untested return types.

Evidence: `artifacts/benchmarks/ios-debugger/default-layout-config-result.json`.

Additional symbol-loading checks removed all 13 original `.o` files temporarily.
Config-based loading of a matching dSYM passed both OC/Swift observation-and-stack
cases. Missing paths, a UUID-mismatched dSYM and repeated entries returned errors
in order without blocking later valid entries. A valid relative path containing
Unicode and spaces was accepted. With only failing paths configured, attach and
an address breakpoint still passed. All `.o` files were restored.
Evidence: `ci-symbols-result.json` and `ci-all-errors-address-result.json`.

A separate compatibility check with debug dylib disabled passed both OC/Swift
observation-and-stack cases. It is not the normal suite's build configuration.
Evidence: `no-debug-dylib-config-result.json`.

Previously, the Host incorrectly required main-executable line tables and blocked
the default layout. That check has been removed; the old failure is retained in
`default-build-result.json` for historical comparison only.
