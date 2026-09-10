# Static method resolution / Hook reentry

The subsequent [19-method comparison](../static-matrix/README.md) confirmed normal and
reentering outcomes for the same static methods under different preparation conditions.
It includes three repeated cold-process pairs for both integer() and staticValue().

This isolated fixture tests a nonrecursive static method without warming it through ApiDemo
navigation. It is a diagnostic, not part of the passing evidence suite. The new ApiDemo path is
**device-verified** on 2026-09-10: HUAWEI JAD-AL50, Android 12 arm64, Frida 17.16.4.
`snapshot + bridge` reproduced nested Hook entry; a repeat also crashed in ART.
See [device-results.json](device-results.json) for every MCP comparison.

## Reproduction path

From the repository root, build and install the auto flavor:

```bash
fixtures/android/ApiDemo/gradlew -p fixtures/android/ApiDemo :app:assembleAutoDebug
adb -s <device-id> install -r fixtures/android/ApiDemo/app/build/outputs/apk/auto/debug/app-auto-debug.apk
```

For **each** comparison, disconnect the previous MCP connection, start a new App process, and
record its PID. Do not reset counters and reuse the process: that does not reset ART entrypoints.
Ensure the configured runtime port is free before starting ApiDemo.

```bash
adb -s <device-id> shell am force-stop com.agenteasyuse.mobileeasyuse.apidemo
adb -s <device-id> shell am start -W -n com.agenteasyuse.mobileeasyuse.apidemo/.ui.MainActivity
adb -s <device-id> shell pidof com.agenteasyuse.mobileeasyuse.apidemo
```

Use `to-android-run` to connect to this package with its configured runtime port and call:

```text
filePath: <repo>/fixtures/android/ApiDemo/probe/evidence/static-resolution/probe.js
functionName: probeStaticResolution
args: ["snapshot", "bridge"]
```

The verified path is: read `getCalls()` on main → install `target(String)` Hook → invoke
`target("probe")` through the Frida wrapper on main → Hook calls its original implementation.
No screen interaction is required. The separate `java` control uses `invokeTarget` as a Java call site.

Repeat in separate cold processes with these controls:

| Arguments | Purpose |
| --- | --- |
| `snapshot`, `java` | Candidate reproducer: initialized class, uncalled target, Java caller |
| `snapshot`, `reflection` | Match the earlier HelloWorld reflection reproduction |
| `snapshot`, `bridge` | Compare direct Frida wrapper invocation, as used by existing static capture tests |
| `none`, `java` | Remove the pre-Hook state read |
| `warm-target`, `java` | Pre-call the target; record whether its entrypoint actually changes |

Interpret the returned result, not just whether RPC completed:

- `reproduced`: nested Hook depth 2, original body called 0 times, guard result returned.
- `normal`: one Hook entry, original body called once, result `original:probe`.
- `inconclusive`: another combination, including an invocation that bypassed the Hook.

`entrypoint` reads the bridge's saved original quickCode and symbol, without patching memory.
This optional diagnostic uses bridge 7.0.12 internals. Compare the symbol, not ASLR addresses.
The depth-2 fallback bounds JavaScript recursion; it cannot guarantee safety against an ART
native crash. A crash must be reported separately, not treated as a successful reproduction.

## Device results

| Preparation / trigger | Observed outcome |
| --- | --- |
| snapshot / bridge | Two nested entries, zero original calls, guard returned; another cold run crashed |
| snapshot / reflection | ART SIGSEGV; no completed result, not counted as a successful assertion |
| snapshot / java | Zero Hook entries, one original call; Hook bypass remains unexplained |
| none / java | Zero Hook entries, one original call; interpreter entrypoint |
| warm-target / java | Zero Hook entries, one original call; still a resolution entrypoint |

A separate instrumented bridge confirmed the same native decisions as HelloWorld:
`replacement → original → replacement`. With only the diagnostic branch change:
`replacement → original → original`, one Hook entry and one original call. Both retained the
resolution entrypoint; no global deoptimization was used. Raw traces are in
`artifacts/login-hook-diagnosis/apidemo-native-trace-{before,fixed}.json`.
The branch experiment is not a production fix. The bypass and native crashes need separate
analysis; these outcomes must not be described as all comparisons passing.

A subsequent isolation audit used cold App processes and standalone, unmodified npm Frida
Java bridge agents, without the MEU JavaScript SDK or presets. Reentry persisted on main and
worker threads, through both wrapper and Java calls, and with bridge 7.0.10–7.0.13.
A constant replacement entered once and returned normally. The installed Gadget was verified
against the official 17.16.4 binary. Thus MEU's JavaScript wrappers are not required to reproduce
the reentry, but the affected ART versions and conditions are not yet established. Earlier
bypass observations do not establish a general distinction between Java and wrapper calls.
The independent scripts and results are in `artifacts/login-hook-diagnosis/vanilla-audit/`.

## Root-cause evidence and remaining checks

Earlier HelloWorld native tracing on HUAWEI JAD-AL50 / Android 12 arm64 / Frida 17.16.4 /
frida-java-bridge 7.0.12 showed:

1. Hook → original method reached the resolution trampoline. Frida returned NULL to allow it.
2. ART resolution transferred execution onward with a nonempty topQuickFrame; the linked frame
   still identified the same Hook replacement.
3. `find_replacement_method_from_quick_code` returned the replacement solely because
   `top_quick_frame != NULL`, before checking the linked replacement. The Hook reentered.

A diagnostic bridge change to that branch removed reentry and allowed the original HelloWorld
UI login without global deoptimization or a mocked result. It is not a production fix: genuine
recursion and other ART versions still require regression coverage.

Android 12 source explains why initialization alone does not guarantee a resolved entrypoint:
on arm64, `MarkClassInitialized` can queue a visibility checkpoint. Only after all threads pass
does the callback mark the class visibly initialized and call `FixupStaticTrampolines`.
The AOSP batch holds up to 16 classes; other flush paths also exist. Thus unrelated class loading
and timing can change the window. A pre-call is not a deterministic repair. This visibility
explanation is source-backed; the affected device's exact class-status transition still needs
measurement and must not be presented as already observed.

ApiDemo **already has** `chain/probeCaptureStatic`, which hooks `SdkFixtureState.staticValue()`.
It navigates/reset fixtures first and directly calls the wrapper. Its verifier checks one
enter/leave pair, but it does not assert a resolution entrypoint or control class visibility.
Therefore its previous pass does not establish which condition prevented the defect.

Sources: [Frida bridge](https://github.com/frida/frida-java-bridge/blob/7.0.12/lib/android.js),
[ART class initialization](https://android.googlesource.com/platform/art/+/android12-release/runtime/class_linker.cc),
[ART resolution](https://android.googlesource.com/platform/art/+/android12-release/runtime/entrypoints/quick/quick_trampoline_entrypoints.cc),
[arm64 entrypoints](https://android.googlesource.com/platform/art/+/android12-release/runtime/arch/arm64/quick_entrypoints_arm64.S).
