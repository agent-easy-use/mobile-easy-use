---
name: to-ios-run
description: Resolve one USB iOS device or running simulator, connect its App runtime with MCP-managed idempotent loading, and execute exactly one supplied operation.
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

Do not boot devices or simulators. For a simulator, use its UDID as `deviceId`.

For a physical device, resolve both IDs once: use the CoreDevice ID for MCP `deviceId` and `devicectl --device`, and the hardware UDID for `iproxy -u`.

## Connect

For a simulator, connect directly to `127.0.0.1:runtimePort` and set `hostPort = runtimePort`.

For a USB physical device, keep one exact iproxy mapping from a free Host port to `runtimePort` running while its MCP Session is retained. Reuse it only when the hardware UDID and both ports match. The ordinary default is:

```bash
iproxy -u "<hardware-udid>" 28484:8484
```

Physical-device signing uses the configuration prepared by `to-ios-integrate`, and attempts to rebuild and sign the Runner when its cached signing is invalid. For signing errors, follow that skill’s signing setup/repair path before retrying `connect`.

Choose another free Host port when 28484 is unavailable. Call `connect` once:

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

The connection instance key is `deviceId + appId`. MCP reuses a healthy matching instance even when a new endpoint or device-side port is supplied; this path validates the retained Runtime and does not invoke the Loader.

After a successful `connect`, retain `compatibilityWarning` and a non-null `compatibility.upgradeRecommendation`. Continue the requested operation and report these non-blocking advisories alongside its result.

For a new or replacement iOS connection, MCP resolves the target kind and runs the idempotent LLDB Loader before creating the Frida connection. The Loader preserves an already-running App or launches it when absent. It accepts only `loaded` or `already-loaded`, requires each bridge/runtime image exactly once, detaches LLDB, and then proceeds with Frida attach. An already-loaded App is verified without loading either dylib again.

Return other `connect` failures without retrying. Do not invoke the Loader separately, install Apps, or call `disconnect` after success.

## Execute

For Inline, call `eval_script({ deviceId, appId, source })` exactly once without rewriting it. For Module, call `call_function({ deviceId, appId, filePath, functionName, args? })` exactly once with the absolute `probe.js` path. Return the response unchanged; do not inspect evidence or retry a failed or timed-out mutation.
