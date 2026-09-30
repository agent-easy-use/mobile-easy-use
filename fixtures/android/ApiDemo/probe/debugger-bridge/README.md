# JDI → Java bridge → Frida feasibility proof

Verified on 2026-09-20: HUAWEI JAD-AL50, Android 12, ApiDemo PID 15443,
Frida Gadget, host Oracle JDK 17. Both expressions returned `bridge-proof-20260920`:

- `session.config.version`
- `session.getConfig().getVersion()`

`AgentBridge.inspect(Object, String)` is an ordinary static Java method (not JNI native).
Its original implementation only returns `FRIDA_NOT_INSTALLED`; the Frida script replaces
it and implements the path traversal. The JDI client does not read the nested fields.

Sequence:

1. Start ApiDemo and attach a dedicated Frida script to its embedded Gadget.
2. Load the fixture class and hook `AgentBridge.inspect`. Reuse the repository's existing
   static-hook initialization preparation; no production SDK change.
3. JDI attaches and installs a breakpoint at `DebuggerBridgeFixture.checkpoint()`.
4. Launch `DebuggerBridgeActivity` using ADB. Its Java worker constructs the target and hits
   the breakpoint, independently of the Frida JS thread.
5. JDI obtains `frame(0).thisObject()` and invokes `inspect` via `ClassType.invokeMethod`,
   passing the actual target object and expression string.
6. Frida performs field/method traversal and returns JSON. JDI reads the returned String
   and asserts both the Frida marker and expected value. The event is resumed and JDI disposed.

The breakpoint uses SUSPEND_EVENT_THREAD; invocation uses INVOKE_SINGLE_THREADED.
Both Frida invocations report `debugger-bridge-proof`, the breakpoint thread.
The raw evidence is [device-result.log](device-result.log). Host-observed invocation plus
result-string read took 62.262 ms and 48.612 ms; these are single observations, not a benchmark.
The JDI client resumed the event and detached; PID 15443 remained alive afterward.
The checkpoint continuation log was not available in the device log buffer, so it is not
used as proof of completion.

## Run from repository root

```bash
fixtures/android/ApiDemo/gradlew -p fixtures/android/ApiDemo :app:assembleAutoDebug
mkdir -p artifacts/benchmarks/jdi-frida-bridge-20260920
node_modules/.bin/frida-compile fixtures/android/ApiDemo/probe/debugger-bridge/agent.js \
  -o artifacts/benchmarks/jdi-frida-bridge-20260920/agent.js -S
javac --add-modules jdk.jdi -d artifacts/benchmarks/jdi-frida-bridge-20260920 \
  fixtures/android/ApiDemo/probe/debugger-bridge/BridgeProof.java
```

Install the autoDebug APK and start `.ui.MainActivity`. The default APK uses Gadget port 8484;
pass that port as the third argument if free. The runner checks the remote process PID before
attaching, and removes only its own ADB forwards.

```bash
node fixtures/android/ApiDemo/probe/debugger-bridge/run.mjs <serial> 8484
```

For the recorded run, TT already occupied 8484. Only the experimental APK's
`lib/*/libmobile_easy_use.config.so` files were changed to port 18484, then the APK was
zipaligned and re-signed using the existing Android debug key before installing.
That isolated APK is at `artifacts/benchmarks/jdi-frida-bridge-20260920/isolated.apk`.
The AAR, production config, TT process and existing forwards were not changed.
The runner defaults to 18484 and currently uses the local JDK 17 path.

Scope: one genuine breakpoint, two successful bridge invocations. No arbitrary-expression,
other-suspension-mode, repeated-attach, or general concurrency claims. The JS parser only
supports the demonstrated identifier field segments and explicit zero-argument calls.
The timeout is a host bound, not a guarantee of cancelling a target method invocation.
