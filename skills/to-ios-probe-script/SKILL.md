---
name: to-ios-probe-script
description: Generate iOS mobile-easy-use exploration scripts using drive, inspect, override and Frida, as an inline snippet or a reusable typed module. Generates code without executing it.
---

# To iOS Probe Script

Generate the smallest script that answers the runtime question. Compose capabilities according to their purpose: drive reaches a scene, inspect observes it, override helps drive establish the scene, and direct Frida executes functions or reads variables alongside any of them. Use only what the question needs. Generate code only; do not connect or execute.

## Read the contracts

Call `get_sdk_declarations({"platform":"ios"})` and read relevant returned `files[].path`: `sdk` for public APIs, `bridge` for Objective-C, and `gum` for native Frida APIs. Declarations govern signatures; use public globals rather than SDK internal imports.

Resolve `presets.directory` from project `.meu/config.json`, relative to the project root (default `.meu/presets`). If `ios/` contains `presets.dist.js`, read `presets.entry.js` and relevant feature declarations. Reuse compatible exports only; an older preset does not prove its APIs still exist. Module code imports declared exports from `/meu/presets.js`; connect loads presets.

## 1. drive — reach the scene

Generate the navigation and interactions that bring the App from a known starting state into the requested scene. Resolve targets from source or runtime evidence. Await input results and bounded completion conditions; successful input delivery alone does not establish that the scene is ready.

Read [drive generation](references/drive.md) for targets, input and waits. Use direct Frida calls to App functions when the requested entry is a route or business operation; use drive input when the user interaction itself matters.

## 2. inspect — observe the scene

Choose observations that answer the question about the scene or the process of reaching it:

Read [inspect](references/inspect.md) for logs, method inputs/results, local variables, expressions, UI state, hierarchy, layout and screenshots.

For events during navigation, install watchers before the relevant trigger. For current UI state or images, read directly at the required checkpoint. Watch/current/stop are asynchronous; UI inspection uses direct reads. Select before/after checkpoints explicitly when comparing changes.

Native object fields and accessors can complement these observations through direct Frida; there is no public inspect.state API. Observation should capture the evidence needed for analysis and subsequent assertions.

## 3. override — help drive establish the scene

Temporarily change a method result, field/property value or code behavior to establish a condition needed by the scenario. Combine that condition with drive navigation or direct App calls. For example, override a dependency's availability result, then drive to the page whose behavior depends on it.

Read [override generation](references/override.md). Install before the dependent operation, keep the override active through its completion, and await the returned removal closure afterward. Inspect the resulting behavior independently; overriding an expected outcome does not demonstrate that the App produced it correctly.

## 4. direct-frida — execute functions and read variables

Use ObjC and known native APIs to call App functions, obtain objects, read fields/accessors or perform other native runtime work. Direct Frida can be used alone or combined with drive, inspect and override; it is not restricted to a fallback path.

For example, call a function to prepare data before drive, read a counter after navigation, or use an App object as the target of override.field. Direct calls verify behavior from the chosen code entry onward; they do not demonstrate an input path that they bypass.

Read [direct Frida](references/direct-frida.md) for function calls, variable/object observations and resource handling. Use source-resolved symbols and respect platform thread and value-conversion requirements.

## Compose the capabilities

A typical exploration establishes required overrides and watchers, drives to the scene, waits for completion, then reads UI/native state and collected records. Choose installation order according to what must be observed. A scene already present may need only inspection; a function-level question may need only direct Frida. Do not require every probe to use all four capabilities.

## Output mode

For small temporary exploration, return a self-contained async IIFE without files, imports or exports:

```js
(async () => {
  return runtimeStatus();
})()
```

For repeated operations, imports or larger exploration, write `probe.js` and `probe.d.ts` in the requested artifact directory. Use named ESM exports; declarations describe only those exports with JSDoc for parameters and results. Never assign rpc.exports, exports or module.exports; the SDK owns RPC. Module top level defines helpers and exports without App actions or installed hooks.

Generated code runs in Frida, without Node.js built-ins or npm resolution. Adjacent Host files are not automatically available to runtime imports. Relative source imports require a bundling workflow.

## Results and cleanup

Watcher current returns cumulative records; stop ends observation and returns final records. Results are `{ok, data, error}`, with an array and string/null error. A failed or truncated capture is incomplete evidence, not proof that an event did not occur.

Use try/finally to stop watchers and await override removal closures. Keep them active through dependent actions and waits. Clean up each acquired resource even if later installation or another cleanup fails; preserve the primary failure and cleanup diagnostics. Unload is a fallback, not normal cleanup.

Default to bounded exports that clean up before settling. If explicitly requested to observe across calls, a module may own its watcher and export start/current/stop operations. Return plain results, not handles or removal functions. Use the same session and module version; stop before replacing the module or disconnecting. Loading changed content does not unload older module versions.

Return values are serialized by the transport layer and delivered to Host/Agent; do not stringify ordinary objects yourself. For native objects, prefer extracting the needed JSON-compatible values before returning: their default serialization may provide only a description, not business state. Include screenshot filePath values in results when needed. Select before/after checkpoints explicitly; no action wrapper automatically captures or aggregates them. Do not imitate an internal Host evidence transport protocol.

## From exploration to assertions

Reuse the trigger and observations in tests with Test.create().expect. Establish expectations from requirements or confirmed behavior; do not make the current result its own expectation.
