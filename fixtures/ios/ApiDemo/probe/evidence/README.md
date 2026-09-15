# Chain capture coverage

Run each named export in the platform's `ApiDemo/probe/evidence/chain/probe.js` serially through
MCP `call_function`. Require the independent App oracle, return to Main, and exactly one manifest;
then run the platform's `verify-evidence.mjs` with the returned `evidenceContract` and file path.

| Export | Android | iOS | Checks |
| --- | --- | --- | --- |
| `probeMethodAndLogChain` | yes | yes | Selected native logs and method capture in one ordered chain |
| `probeCaptureSuccess` | yes | yes | 256 KiB retained buffer, 15 ms native delay, args/result and real memory |
| `probeCaptureRecursive` | yes | yes | Three nested entries followed by inner-to-outer completions |
| `probeCaptureExtractorErrors` | yes | yes | Args/result exceptions preserve business results and resource fields |
| `probeCaptureOptions` | yes | yes | Absent/empty/disabled capture; each option alone; metric deduplication; immutable JSON snapshot |
| `probeCaptureConfigMatrix` | yes | yes | Nine invalid configurations reject before action and roll back earlier hooks |
| `probeCaptureAsyncCleanup` | yes | yes | Async resolve/reject, original error identity, hook removal and reinstallation |
| `probeCaptureFilterErrors` | yes | yes | False/throwing filters skip capture and preserve original calls |
| `probeCaptureConcurrent` | yes | yes | Two overlapping native threads, separate inputs/results and before/after readings |
| `probeCaptureScalars` | yes | yes | Boolean, exact 64-bit values, null and void; Android overload selection; iOS signed byte/unsigned 64-bit |
| `probeCaptureStatic` | yes | yes | Static/class method, zero explicit arguments and original result |
| `probeCaptureThrow` | yes | — | Java exception remains unchanged; exit resources present; result extractor skipped |
| `probeCaptureFilterAndDisabled` | yes | — | Mixed accepted/rejected calls plus a method without capture |
| `probeCaptureInvalidConfigCleanup` | yes | — | Unsupported metric rollback regression |
| `probeCaptureUnsupportedABI` | — | yes | Floating-point/aggregate capture errors; original native behavior and timing preserved |
| `probeThreadNames` | yes | yes | Main-thread method/log, log-only capture, named concurrent workers and repeated log-hook installation |
| `probeCaptureStackOptions` | yes | yes | Omitted/false/default/custom stacks, real caller frames and composition with existing capture |
| `probeCaptureStackConfig` | yes | yes | Invalid stack types/depths, pre-action rejection, rollback and reinstallation |
| `probeCaptureStackLifecycle` | yes | yes | Recursive stacks, filtered calls, async rejection and cleanup |
| `probeRuntimeTargetResolution` | — | yes | Short multi-module class target resolved internally by its selector |

Totals: 19 Android exports and 18 iOS exports. Matrix exports contain several assertions/cases;
export counts are not assertion counts. For a cold-start run, start a fresh App process before each
export and record its PID; assertions within that export share the same process.

The host oracle `chain-capture-contracts.mjs` is test-only. It validates event ordering,
phase ownership, exact payloads, numeric fractional milliseconds, valid byte readings and exact
deltas. Memory deltas may be zero or negative: they are process readings, not method allocations.

`test/chain-capture.test.js` additionally uses fault injection for clock failures, memory read
failures, short iOS task-info responses, and exclusion of collection/output overhead from timing.
Those are host tests, not device-tested system failures. iOS generic Objective-C exception capture
is outside the API contract; async JavaScript rejection tests do not claim to cover it.

Thread/stack manifests use `chain-context-*-v1` and the independent host oracle
`chain-context-contracts.mjs`. Every method/log event has `threadName` (null when unavailable).
Stacks are opt-in, appear on enter only and default to at most five frames. Android captures Java
frames (limit 1–64); iOS captures accurate native frames from the intercepted CPU context (limit
1–16). The deep native fixtures validate real callers and exact small limits, not fabricated stacks.
Android's main-thread log fixture posts a native Handler callback so logging runs outside an
injected JavaScript callback. Worker names are set by native fixture code; names changed by a test
are restored before completion. Adjacent log captures exercise listener cleanup/reinstallation.

Host fault-injection tests additionally cover stack-read failures without changing business results,
stack work excluded from timing, Android throws, missing iOS symbols, unavailable thread names and
native name fallback. These injected failures are not claimed as device failures.

For a cold-start stack regression, run `probeThreadNames` first: its two workers must be the first
application threads requesting stacks. The SDK initializes the Frida Java stack backend during
serial hook installation to prevent a race in its first-use CModule initialization.

## State snapshots and method matching

Run each export separately and check `result.passed`, `navigation.returnedToMain`, and its single
manifest with the platform verifier. `state-runtime-contracts.mjs` checks the actual host artifact.

| Module / export | Platforms | Evidence contract | Assertions |
| --- | --- | --- | --- |
| `state/probeAsyncStateGetters` | Android, iOS | `state-runtime-async-v1` | Main-thread native reads, serial getter order, sync null, native counter 0→1, original result |
| `state/probeStateGetterErrors` | Android, iOS | `state-runtime-getter-errors-v1` | Thrown and rejected getters record per-checkpoint errors; successful null remains distinct |
| `state/probeStateFailureIsolation` | Android, iOS | `state-runtime-failure-v1` | Failed before / recovered after, valid before / failed after, native action still runs, exact action error preserved |
| `chain/probeInstanceMethodMatching` | iOS | `chain-method-match-instance-v1` | Shared native IMP; only exact selector on target/child instances enters filter/capture; alias, sibling, class and overridden implementation excluded |
| `chain/probeClassMethodMatching` | iOS | `chain-method-match-class-v1` | Same checks for target/child class receivers; instance excluded; configured className stable |
| `chain/probeChildInstanceMethodMatching` | iOS | `chain-method-match-child-instance-v1` | Inherited child target accepts child/grandchild instances; excludes parent sharing the IMP |
| `chain/probeChildClassMethodMatching` | iOS | `chain-method-match-child-class-v1` | Same child-target checks for class methods |
| `chain/probeRuntimeTargetResolution` | iOS | `chain-runtime-target-resolution-v1` | Short class name and selector resolve the unique full Runtime class before hooking |
| `ui/probeUiStateEvidence` | Android, iOS | `ui-state-v1` | Generated main-thread text getter plus UI screenshots, one action and one aggregated manifest |
| `chain/probeMethodOverloads` | Android | `chain-complete-overloads-v1` | Exact argumentTypes identify int/String overloads on enter/leave without capture |
| `chain/probeCaptureScalars` | Android | `chain-complete-scalars-v1` | Exact signatures at both phases, int overload selection, and String overload exclusion |

The iOS fixture verifies IMP equality through the Objective-C runtime before hooking and maintains
an independent native call counter. All eight business calls execute (nine for child targets), only two are captured, and a
post-cleanup call produces no event. Getter failures are deliberate probe inputs,
not claims of real network or system failures. No missing screenshot or transport success substitutes
for the manifest oracle.

Host state tests additionally use manually settled Promises to verify pending before/after barriers,
delayed rejection recovery, and the complete set of getter error records on both platforms.
UI visibility probes verify before/after snapshots and checkpoint screenshots; UI entries must omit `changed`.

See [Override ApiDemo coverage](override-coverage.md) for the dual-platform method and field test matrix.
