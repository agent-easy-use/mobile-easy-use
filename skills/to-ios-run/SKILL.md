---
name: to-ios-run
description: Resolve one USB iOS device or running simulator, connect its App runtime, use one idempotent LLDB load only when the initial connection fails, and execute exactly one supplied operation.
---

# To iOS Run

Run exactly one supplied iOS operation. Require `appId`; accept optional canonical `deviceId` and device-side `runtimePort`, defaulting to 8484. Accept exactly one execution form:

1. `source`: one complete `(async () => { ... })()` expression.
2. `scriptPath + functionName`: one named Module export.
3. `scriptPath + naturalDescription`: read the matching `probe.d.ts` completely and select exactly one export. Stop on no match, ambiguity, or missing required arguments.

Optional positional `args` apply only to Module. Do not convert between Inline and Module. If code is missing, first use `to-ios-script`.

## Target

Discover currently booted CoreSimulator devices and currently available USB CoreDevice devices. Exclude shutdown simulators and network-only, unavailable, unpaired, or unusable physical devices.

- Supplied `deviceId`: require an exact eligible match.
- Omitted `deviceId`: use the only eligible target; on zero or multiple matches, stop and report canonical IDs, names, and kinds.

Do not boot devices or simulators. Use a simulator UDID for CoreSimulator. For a physical device, resolve the canonical CoreDevice identity and hardware UDID once for the Loader and iproxy.

## Connect

For a simulator, connect directly to `127.0.0.1:runtimePort` and set `hostPort = runtimePort`.

For a USB physical device, keep one exact iproxy mapping from a free Host port to `runtimePort` running while its MCP Session is retained. Reuse it only when the hardware UDID and both ports match. The ordinary default is:

```bash
iproxy -u "<hardware-udid>" 28484:8484
```

Choose another free Host port when 28484 is unavailable. Call `connect` immediately; do not run the Loader first:

```js
connect({
  platform: "ios",
  deviceId,
  appId,
  runtimePort,
  ip: "127.0.0.1",
  port: hostPort
})
```

The connection instance key is `deviceId + appId`. A healthy matching instance is reused even when a new endpoint or device-side port is supplied.

If this first `connect` succeeds, proceed directly to execution. If it fails because the runtime cannot be connected, run exactly one matching command:

- If the runtime reports that its `appId` differs from the requested `appId`, stop and return the original port-occupied error. Another App owns `runtimePort`; do not run the Loader or start, stop, or restart either App.

```bash
mobile-easy-use-ios load --simulator "<simulator-udid>" --bundle-id "<app-id>"
mobile-easy-use-ios load --device "<device-id>" --bundle-id "<app-id>"
```

The Loader preserves an already-running App or launches it when absent, attaches LLDB, and loads MobileEasyUse idempotently. Require `loadState` to be `loaded` or `already-loaded`, each bridge/runtime image to appear exactly once, and `detachState: "detached"`. Stop if it fails. After it succeeds, call the same complete `connect` exactly once more and stop if that connection fails.

Do not run the Loader for invalid arguments, an App identity mismatch, or an operation already in progress. Do not install Apps or call `disconnect` after success.

## Execute

For Inline, call `eval_script({ deviceId, appId, source })` exactly once without rewriting it. For Module, call `call_function({ deviceId, appId, filePath, functionName, args? })` exactly once with the absolute `probe.js` path. Return the response unchanged; do not inspect evidence or retry a failed or timed-out mutation.
