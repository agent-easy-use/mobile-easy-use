---
name: to-android-run
description: Resolve one online USB Android device or running emulator, connect its App runtime, cold-start the App once only when the initial connection fails and it is not running, and execute exactly one supplied operation.
---

# To Android Run

Run exactly one supplied Android operation. Require `appId`; accept optional canonical ADB `deviceId` and device-side `runtimePort`, defaulting to 8484. Accept exactly one execution form:

1. `source`: one complete `(async () => { ... })()` expression.
2. `scriptPath + functionName`: one named Module export.
3. `scriptPath + naturalDescription`: read the matching `probe.d.ts` completely and select exactly one export. Stop on no match, ambiguity, or missing required arguments.

Optional positional `args` apply only to Module. Do not convert between Inline and Module. If code is missing, first use `to-android-script`.

## Target

Run `adb devices -l`. Eligible targets are entries in state `device` that are either running emulators or physical devices with a USB transport. Exclude wireless, offline, and unauthorized entries.

- Supplied `deviceId`: require an exact eligible match.
- Omitted `deviceId`: use the only eligible target; on zero or multiple matches, stop and report the available canonical IDs.

Do not boot devices or start emulators. Use `adb -s "<device-id>"` for every later ADB command.

## Connect

Prepare a free Host port mapped to `runtimePort`. Reuse only an exact serial/Host/device-port mapping. The default is:

```bash
adb -s "<device-id>" forward --no-rebind tcp:18484 tcp:8484
```

Choose another free Host port when 18484 is unavailable. Call `connect` immediately; do not inspect or start the App first:

```js
connect({
  platform: "android",
  deviceId,
  appId,
  runtimePort,
  ip: "127.0.0.1",
  port: hostPort
})
```

The connection instance key is `deviceId + appId`. A healthy matching instance is reused even when a new endpoint or device-side port is supplied.

After a successful `connect`, retain `compatibilityWarning` and a non-null `compatibility.upgradeRecommendation`. Continue the requested operation and report these non-blocking advisories alongside its result.

If this first `connect` succeeds, proceed directly to execution. If it fails because the runtime cannot be connected:

- If the runtime reports that its `appId` differs from the requested `appId`, stop and return the original port-occupied error. Another App owns `runtimePort`; do not inspect, start, stop, or restart either App.

1. Require the package to be installed and check whether its exact main process is running.
2. If it is already running, stop and return the original connection failure. Do not force-stop, restart, or otherwise disturb it.
3. If it is not running, resolve its exported MAIN/LAUNCHER activity, cold-start it once with `am start -W`, and wait for the exact main process to become live.
4. Call the same complete `connect` once more. Stop if startup or this second connection fails.

Do not cold-start for invalid arguments or an operation already in progress. Do not install Apps or call `disconnect` after success.

## Execute

For Inline, call `eval_script({ deviceId, appId, source })` exactly once without rewriting it. For Module, call `call_function({ deviceId, appId, filePath, functionName, args? })` exactly once with the absolute `probe.js` path. Return the response unchanged; do not inspect evidence or retry a failed or timed-out mutation.
