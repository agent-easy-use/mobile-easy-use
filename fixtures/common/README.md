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
| `probeCaptureInvalidValues` | yes | yes | Undefined, NaN, Infinity, cycles, Promise, function and runtime wrapper rejected at both phases |
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

Totals: 19 Android exports and 17 iOS exports. Matrix exports contain several assertions/cases;
export counts are not assertion counts. For a cold-start run, start a fresh App process before each
export and record its PID; assertions within that export share the same process.

The shared host oracle `chain-capture-contracts.mjs` is test-only. It validates event ordering,
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
