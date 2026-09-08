---
name: to-android-script
description: Generate Android mobile-easy-use runtime code as either a temporary inline async IIFE or a reusable ES module with matching TypeScript declarations. Use for runtime discovery, inspection, instrumentation, App driving, temporary Java return overrides, scoped evidence, or other bounded Frida work; prefer Inline for small one-off exploration and Module for larger or relatively stable work.
---

# To Android Script

Generate the smallest Android runtime code that answers the requested runtime question. Prefer Driver for requested user-visible actions, use Override only when normal App configuration or Driver actions cannot establish a required condition, add Evidence only when needed to answer the question, and use Direct Frida only when the encapsulated capabilities are insufficient. Perform only the requested operations and collect only the required results. Generate code only; do not connect to a device or execute it.

## Common contract

Before generating Module code, inspect `docs/mobile-easy-use/presets.d.ts` when it exists. Prefer its existing capabilities over generating equivalent driver or probe code. Import only its declared exports from the stable Frida module path `/docs/mobile-easy-use/presets.js`:

```js
import { xxxx } from '/docs/mobile-easy-use/presets.js';
```

`docs/mobile-easy-use/presets.js` is a Rollup-built single-file ES module loaded once when the MCP connects; do not read, modify, build, or copy it. Do not compute a relative import from the generated `probe.js`: the Host file path and the Frida module path are separate concepts. Inline code cannot import presets. If a capability is unavailable in the selected mode, generate the smallest local implementation instead. Also inspect the target repository when identifiers or business symbols are unknown; never guess them.

## Output mode

Choose one output mode before generating code.

### Inline

Use Inline for temporary, one-off exploration implemented by a small, self-contained snippet. Return one complete async IIFE:

```js
(async () => {
  return runtimeStatus();
})()
```

Do not create files or declarations, and do not use imports or exports. Keep temporary hooks, timers, and listeners scoped to the IIFE and clean them up with `try/finally`. Return only values that Frida RPC can transport.

### Module

Use Module for larger code, relatively stable exploration, repeated execution, multiple callable operations, shared helpers, imports, reviewable artifacts, or a typed call contract. Write both files into the requested artifact directory:

```text
probe.js
probe.d.ts
```

Declare only module exports in `probe.d.ts`. Add JSDoc describing every exported method and parameter. Do not declare internal actions, helpers, or SDK globals.

A module may export multiple scenario or probe methods. Module top level must only define helpers and exports: do not perform business actions or install persistent hooks while loading. Put behavior inside exported functions and clean up temporary hooks before each function settles, because loading changed content does not unload older module versions.

`probe.js` is a standard ES Module. Export every callable entry with named ESM syntax:

```js
export function inspectState() {
  // ...
}

export async function openTargetPage() {
  // ...
}
```

Never use CommonJS `exports.name = ...` or `module.exports`, and never use Frida
`rpc.exports`. The Android SDK agent owns `rpc.exports`; probe loading rejects these
forms with an explicit error.

## Execution thread

- Do not assume the execution thread; generated code generally does not run on the Android main thread.
- For direct Android UI or another main-thread-only API, wrap the work with `await AndroidExp.runOnMainThread(() => ...)`.
- Keep non-UI work on its required thread when source or API contracts specify one; never move arbitrary business calls to the main thread merely because they use Java.

## 1. Driver

Unless the caller specifies another initial scene, assume the App starts on its home page. Generate Driver code from that state to each requested scene. Prefer high-level input because it reproduces real user behavior; use routing or business methods only when the requested scenario explicitly requires them.

1. Read [references/driver-generation.md](references/driver-generation.md) before generating any App-driving code.
2. In Module mode, export only the entry methods the caller needs. In Inline mode, put the requested flow directly in the IIFE. One operation may compose multiple driver steps.
3. Stop a flow when an input or wait result has `ok: false`.

## 2. Override

Add Override code only when the requested condition cannot reasonably be established through normal App configuration or Driver actions. Override controls a test precondition; it does not drive the App or prove the result.

Read [references/override-generation.md](references/override-generation.md) before generating Override code. Wrap the complete dependent Driver and Evidence work in one `Override.run(definitions, action)` call. Never install an Override at Module top level or leave one active after the generated operation settles.

## 3. Evidence

Add Evidence code only for evidence requested by the user or required to answer the runtime question.

Treat an action as the smallest evidence boundary:

- one action may contain one call or multiple driver steps that express one intent;
- one generated operation may execute one or multiple actions;
- use the entire operation as one action when no smaller boundary is needed;
- define the driver flow first, then wrap the exact action with evidence;
- include the trigger and required completion wait inside `action`; use a bounded completion condition and propagate failure or timeout;
- use a concise, non-empty `actionDescription` as the sole aggregation key within the operation: unique per action execution (including repetitions), shared only by wrappers observing that same execution.

Read only the evidence references needed by the probe:

- critical method execution or fixed-TAG logs: [references/critical-chain-evidence.md](references/critical-chain-evidence.md);
- state snapshots before and after an action: [references/critical-state-evidence.md](references/critical-state-evidence.md);
- UI snapshots before and after an action: [references/critical-ui-evidence.md](references/critical-ui-evidence.md).

Generate evidence with the matching `Probe.evidence.withChainEvidence()`, `Probe.evidence.withStateEvidence()`, or `Probe.evidence.withUiEvidence()` wrapper. These APIs clean up their temporary instrumentation after the wrapped action returns, throws, or its Promise settles, so the wrapper leaves no active Hook or cleanup work behind. This guarantee applies to the evidence instrumentation, not to effects produced by the wrapped business action.

## 4. Direct Frida

Prefer Driver, Override, and Evidence when they accurately express the request. Do not use Direct Frida merely because it is shorter.

Use the native Java bridge exposed as `globalThis.Java`, or other Frida Gum APIs, when the encapsulated capabilities are insufficient. Direct Frida may form a standalone probe or compose with the other capabilities.

Read [references/direct-frida-generation.md](references/direct-frida-generation.md) before generating Direct Frida code.

## SDK boundaries

The SDK provides these globals:

1. `Java`: native Frida Java bridge exposed as `globalThis.Java` for Android Framework, business, and third-party Java/Kotlin classes.
2. `R`: dynamic Android application resources such as `R.id.search_button`.
3. `AndroidExp`: reusable Android extensions for main-thread dispatch, window access, input, and waits.
4. `Override`: action-scoped Java method return substitution.
5. `Probe.evidence`: action-scoped critical-chain, state, and UI evidence.

Follow native Frida semantics; use `Java.registerClass()` to implement Java interfaces. Prefer the encapsulated SDK capabilities when they preserve the requested semantics. Treat repeated, reusable missing capabilities, rather than one direct Frida use, as candidates for a preset or SDK extension.

Before delivery, verify that every referenced symbol comes from source or the SDK and no unrequested evidence or interaction was added. For Inline, verify the result is one complete async IIFE with no imports or exports. For Module, verify that `probe.js` uses named standard ES Module exports and its exports match `probe.d.ts`.
