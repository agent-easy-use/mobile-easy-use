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

UI Evidence operations return an `evidenceContract`. Validate their single Evidence manifest after
the operation:

```bash
node fixtures/android/ApiDemo/probe/evidence/verify-evidence.mjs \
  <result.evidenceContract> \
  <evidence[0].evidencePath>
```

Standalone screenshot probes validate `result.window` and `result.targets`. These paths point to JPEG
files written by the Controller. Screenshots are intentionally not written as a top-level Evidence field.
