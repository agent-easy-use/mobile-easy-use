# Static method Hook comparison

Verified on 2026-09-10: HUAWEI JAD-AL50, Android 12 arm64, official Frida 17.16.4
and unmodified Java bridge 7.0.12. The isolation runs loaded no MEU SDK or presets
and used no deoptimization or bridge patch. Each comparison used a fresh App process.

**Static methods do not invariably reenter.** Across 19 distinct methods, 47 completed
comparisons produced 25 normal original-call results, 21 abnormal reentry results,
and one normal constant-replacement control. One additional attempt failed to acquire
an App PID during startup, before agent loading; it is recorded separately. The batch
stopped, the process was confirmed absent, and later comparisons used new processes.

All raw results, options and PIDs are in [device-results.json](device-results.json).
An additional standard MCP Module check on PID 31805 returned 12 with one Hook entry
and one original execution for `m0 / none`; the Hook was confirmed cleared afterward.

## Observed comparisons

`none` installs the Hook without calling a preparation method. It does not claim that
the class has never been loaded or that existing UI methods have never executed.
`snapshot` reads the fixture counter before installing the Hook. `initialize` explicitly
initializes the target's declaring class through `Class.forName(..., true, loader)`.

Counts below are Hook entries / original method executions, excluding preparation.

| Target / key | none | snapshot |
| --- | --- | --- |
| SdkFixtureState.staticValue / sdk-value | 1 / 1, normal | 2 / 0, reentry |
| StaticResolutionFixture.target / resolution-target | Not tested in this matrix | 2 / 0, reentry |
| integer(int) / m0 | 1 / 1, normal | 2 / 0, reentry |
| bool(boolean) / m1 | 1 / 1, normal | 2 / 0, reentry |
| wide(long) / m2 | 1 / 1, normal | 2 / 0, reentry |
| consume(String) / m3 | 1 / 1, normal | 2 / 0, reentry |
| overloaded(int) / m4 | 1 / 1, normal | 2 / 0, reentry |
| overloaded(String) / m5 | 1 / 1, normal | 2 / 0, reentry |
| synchronized locked(int) / m6 | 1 / 1, normal | 2 / 0, reentry |
| recursive(2) / m7 | 3 / 3, arguments 2 → 1 → 0 | 5 / 0, argument stays 2 |
| fail() / m8 | 1 / 1, expected exception | 2 / 0, body never reached |
| Plain.integer(int) / m9 | 1 / 1, normal | 1 / 1, normal |
| Initialized.integer(int) / m10 | 1 / 1, normal | 1 / 1, normal |

For m9/m10, `snapshot` reads the **outer class's** counter, not the declaring class's
own state. Explicitly initializing the declaring class caused both to reenter (2 / 0).
Plain has no source static initializer; Initialized has one. Its mere presence does
not determine the outcome.

Six further existing methods each entered their Hook once and returned the expected
result: SdkFixtureState.getInstance (`sdk-instance`), ApiDemoState.getInstance
(`state-instance`), ChainCaptureFixture.getInstance (`chain-instance`),
ApiDemoController.getGeneration (`controller-generation`),
ApiDemoController.getActivity (`controller-activity`), and UiFactory.dp (`ui-dp`).
These methods have no dedicated body counter; their results record successful return
from the original-call wrapper rather than an independently counted body execution.

## Repeated and additional controls

- `m0` and `sdk-value`: three independent cold runs per preparation mode consistently
  gave normal results with `none`, and reentry with `snapshot`.
- `m0`: an explicit Java call site gave the same none/snapshot contrast; snapshot/Java
  reentry was reproduced again in another cold process. Other planned Java cases were
  not completed after the startup interruption and must not be counted as tested.
- `m0 / snapshot` also reentered on main, so it is not limited to the worker thread.
- `m0 / warm`: one original invocation before Hook installation returned 12, but the
  subsequent hooked call still reentered; its original-call delta was zero.
- `m0 / snapshot / constant`: Hook entered once, returned the sentinel, and executed
  the original zero times. This is a control, not a successful original call.
- All 21 reentry results had a saved `art_quick_resolution_trampoline` entry. All 25
  normal original-call results had `art_quick_to_interpreter_bridge`. The constant
  control retained the resolution entry and did not reenter.

The guard returns at depth 2, or 5 for genuine recursion, to bound the diagnostic.
These are observed bounded reentries, not 21 unbounded stack-overflow experiments.
`originalReturns` counts wrapper returns and can include a returned guard value;
only `originalCalls` is the fixture's independent body counter.

## Reproduce with MCP

Build/install ApiDemo's autoDebug APK. For **each** call, disconnect the previous
connection, force-stop and cold-start ApiDemo, then connect to the exact package using
`to-android-run`. The module deliberately refuses a second operation in the same
module instance. Clearing counters does not restore the ART entry state.

Call the named export with one JSON-string argument:

```text
filePath: <repo>/fixtures/android/ApiDemo/probe/evidence/static-matrix/probe.js
functionName: probeStaticMethod
args: ["{\"key\":\"m0\",\"preparation\":\"none\"}"]
```

Repeat in a new process with `preparation: "snapshot"`. To use a Java call site, add
`trigger: "java"` (supported by m0–m10 and resolution-target). Other options are in
[probe.d.ts](probe.d.ts). MCP loads its SDK, so label these as SDK comparisons, not
standalone bridge isolation runs.

The standalone wrapper and host runner used for the recorded isolation results are
in the workspace's `artifacts/login-hook-diagnosis/vanilla-audit/` directory:
`agent-static-matrix.js`, `run.mjs`, and `run-static-matrix.mjs`. The wrapper imports
the verified official bridge, exposes this same probe through its own RPC, and is
bundled before loading into an otherwise fresh Gadget session.

## Scope

The comparison confirms conditional failure in the original-call path on this device,
across different signatures and method bodies. Preparation order and the ART entry
state distinguish the tested outcomes. The earlier native branch trace explains the
observed redispatch. This matrix does not measure the device's exact class visibility
transition, establish behavior on other ART versions, or validate a production patch.

## Continuous original calls without recursion protection

A follow-up kept the same Hook installed across 100 consecutive calls, with the
recursion guard disabled and every callback invoking the original method. It used
the same unmodified official bridge in fresh processes, without the SDK or deoptimization.

Three static methods (`integer`, synchronized `locked`, and existing `staticValue`)
were each tested with all four original-call styles:

```javascript
method.call(this, ...args)
method.call(C, ...args)
this[methodName](...args)
C[methodName](...args)
```

All 12 comparisons completed: each recorded 100 Hook entries, 100 original executions,
the expected return value, and maximum nested depth 1. These 1,200 calls disprove
both inevitable reentry and "only the first original call works" for these controls.

A separate Java-call-site comparison completed 100 original executions but recorded
only 22 Hook entries, still with maximum depth 1. It is **partial Hook bypass**, not
reentry and not a fully passing Hook test. The batch stopped on that failed assertion;
the process was confirmed alive before starting different comparisons in fresh processes.
The exact bypass mechanism was not established by this test.

Four further controls read same-class state before installing the integer Hook. All
four call styles reentered at depth 2, with zero original executions; these controls
enabled the diagnostic guard. Changing the original-call syntax therefore did not
remove the known reentry condition.

The 17 additional results and distinct PIDs are in [continuous-results.json](continuous-results.json).
The standalone agent and host runner are retained in the workspace under
`artifacts/login-hook-diagnosis/vanilla-audit/agent-static-continuous.js` and
`run-static-continuous.mjs`. These results supplement the original 47-run matrix.
