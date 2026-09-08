# ApiDemo Android SDK probes

This directory contains Module operations for the MobileEasyUse Android SDK. Each capability
directory contains one side-effect-free `probe.js` ESM module and its matching `probe.d.ts`.

## Execution contract

Probe functions must only be executed by an agent using `skills/to-android-run` in Module mode.
There is no standalone runner or suite entry point in this directory.

Before the first operation, build and install ApiDemo `autoDebug`, start its `MainActivity`, and
keep one unlocked ADB device connected. Give the agent exactly one operation at a time:

- `platform`: `android`
- `scriptPath`: the absolute path to the capability's `probe.js`
- `functionName`: one export declared by the adjacent `probe.d.ts`
- `args`: positional arguments required by that declaration, if any

For example, request `probeClickById` from `input/probe.js`. The agent establishes local ADB port
forwarding, connects to MobileEasyUse, and invokes that one export with `call_function`.

Every capability probe owns its navigation: it starts from `MainActivity`, opens the capability and
scenario items, performs one SDK assertion, and returns to `MainActivity`. Run operations serially;
do not invoke a second probe until the previous operation has returned.

The caller is responsible for evaluating the returned `result` and `evidence`. In particular, a
transport-level success alone does not mean the probe oracle passed; require `result.passed === true`
and inspect Evidence when the operation is intended to produce it.

Evidence operations return an `evidenceContract`. Validate their single Evidence manifest after
the operation:

```bash
node fixtures/android/ApiDemo/probe/evidence/verify-evidence.mjs \
  <result.evidenceContract> \
  <evidence[0].evidencePath>
```

Standalone screenshot probes validate `result.window` and `result.targets`. These paths point to JPEG
files written by the Controller. Screenshots are intentionally not written as a top-level Evidence field.

## Chain capture on a physical Android device

The `Evidence > Method capture: data, time and memory` scene uses a bounded Java fixture.
Execute each export in `evidence/chain/probe.js` separately, from MainActivity:

| Export | Evidence contract | Assertion |
| --- | --- | --- |
| `probeCaptureSuccess` | `chain-capture-success-v2` | 256 KiB retained buffer, 15 ms delay, extracted args/result, actual Java/native heap reads |
| `probeCaptureThrow` | `chain-capture-throw-v2` | Original Java exception and before/after capture, no result extractor |
| `probeCaptureFilterAndDisabled` | `chain-capture-filter-v2` | Excluded call absent; unconfigured method retains legacy evidence |
| `probeCaptureRecursive` | `chain-capture-recursive-v2` | Three nested calls retain their own inputs, outputs and elapsed times |
| `probeCaptureExtractorErrors` | `chain-capture-errors-v2` | Two extractor errors do not change original return or suppress metrics |
| `probeCaptureInvalidConfigCleanup` | `chain-capture-cleanup-v2` | Invalid later hook rolls back earlier hook; reinstallation succeeds |

Require both `result.passed === true` and a successful manifest verification:

```bash
node fixtures/android/ApiDemo/probe/evidence/verify-evidence.mjs <contract> <evidencePath>
```

A successful RPC alone is insufficient. Memory deltas may be negative because these are process
readings, not per-method allocations; tests check valid readings and exact subtraction, not a
minimum allocation delta. Each probe releases its retained fixture buffer and returns to MainActivity.

The v2 contracts require `capture.args` (or its extraction error) on `enter` before the original
method runs. `leave`/`throw` carries `capture.elapsedMs` as a number with fractional milliseconds,
before/after memory, and exit-side capture errors. Only normal `leave` carries `capture.result`.
Previously archived v1 device evidence keeps its original format and is not a v2 verification run.

See the [chain capture coverage matrix](../../../common/README.md) for the full set of platform exports,
manifest assertions, and fault-injection boundaries.

## Thread names and entry stacks

The chain module also exports `probeThreadNames`, `probeCaptureStackOptions`,
`probeCaptureStackConfig`, and `probeCaptureStackLifecycle`. Run each separately and validate the
returned `chain-context-*-v1` Evidence contract with the same host verifier. These cover default
thread names on method/log events, log-only capture, concurrent named workers, optional entry
stacks (default depth 5), depth validation, filtering, recursion and hook cleanup.

## State accuracy and asynchronous getters

The state module exports `probeAsyncStateGetters`, `probeStateGetterErrors`, and
`probeStateFailureIsolation`. Run each separately and verify its `state-runtime-*-v1` manifest.
See the [runtime coverage matrix](../../../common/README.md#state-snapshots-and-method-matching)
for exact assertions and platform-specific method-matching probes.

`evidence/chain/probeMethodOverloads` verifies actual overload signatures without capture (`chain-complete-overloads-v1`).
