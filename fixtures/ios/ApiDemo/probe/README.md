# ApiDemo iOS SDK probes

This directory contains Module operations for the MobileEasyUse iOS SDK. Every capability directory
contains a side-effect-free standard ESM `probe.js` and matching `probe.d.ts`.

Probe functions must be executed serially by an agent using `skills/to-ios-run` in Module mode.
There is no standalone runner or suite entry point. Before the first operation, build/install
`ProbeDebug`. The first MCP `connect` launches a simulator App with the injected images, or loads
them into a physical-device App, automatically; a healthy retained connection skips this work.

Give the agent one operation at a time:

- `platform`: `ios`
- `ip`: `127.0.0.1`
- `port`: `28484` for a USB device (`iproxy -u "<device-udid>" 28484:8484`), or `8484` for a simulator
- `scriptPath`: absolute path to `probe.js`
- `functionName`: one export from the adjacent `probe.d.ts`
- `args`: positional arguments, if declared

Each capability probe navigates from Main with `IOS.input`, waits for the isolated fixture, invokes
one SDK contract, asserts an independent Objective-C oracle, and returns to Main. A transport-level
success is insufficient: require `result.passed === true`. Evidence probes must also return the
expected evidence file.

Evidence operations have a mandatory second validation layer. Read `result.evidenceContract`
from the probe result and validate the single returned Evidence JSON file on the host:

```bash
node fixtures/ios/ApiDemo/probe/evidence/verify-evidence.mjs \
  <result.evidenceContract> \
  <evidence[0].evidencePath>
```

An Evidence probe passes only when all three conditions hold:

1. `result.passed === true` (action and independent App oracle);
2. exactly one Evidence file is returned;
3. `verify-evidence.mjs` exits zero for the declared contract.

This host-side check is required because the Evidence file is aggregated after the in-process
Module operation returns; a probe cannot truthfully validate its own final MCP artifact.

Standalone screenshot probes instead validate `result.window` and `result.targets`; these paths point to JPEG
files written by the Controller without adding a top-level `screenshots` field to Evidence JSON.

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

`evidence/ui/probeUiStateEvidence` reads the requested native label text through a main-thread state getter
and aggregates it with UI screenshots for the same action (`ui-state-v1`); it does not add SDK UI properties.
