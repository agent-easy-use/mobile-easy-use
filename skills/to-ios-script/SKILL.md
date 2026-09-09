---
name: to-ios-script
description: Generate iOS mobile-easy-use runtime code as either a temporary inline async IIFE or a reusable ES module with matching TypeScript declarations. Use for runtime discovery, UIKit inspection, instrumentation, App driving, temporary Objective-C method or field overrides, scoped evidence, or other bounded Frida work; prefer Inline for small one-off exploration and Module for larger or relatively stable work.
---

# To iOS Script

Generate the smallest iOS runtime code that answers the requested runtime question. Prefer Driver for requested user-visible actions, use Override only when normal App configuration or Driver actions cannot establish a required condition, add Evidence only when needed to answer the question, and use Direct Frida only when the encapsulated capabilities are insufficient. Driver, Override, Evidence, and Direct Frida can compose within their API boundaries; use only what the question requires and avoid unnecessary probing. Generate code only; do not connect to a device or execute it.

## Before generating code

Call `get_sdk_declarations({"platform":"ios"})` to obtain declaration paths in `files[].path`. It returns `sdk` (platform SDK), `bridge` (Frida Objective-C bridge), and `gum` (native Frida APIs) declarations. The capability sections below specify which declarations to read.

Resolve `presets.directory` from `<project-root>/.meu/config.json`
relative to the project root, defaulting to `.meu/presets`. If `<base-directory>/ios/`
contains `presets.dist.js`, read `presets.entry.js` to identify public exports and the
corresponding feature `probe.d.ts` files for their contracts. Prefer reusing capabilities that
satisfy the request; import only names exported by the entry, including any aliases.

When reusing a preset, use Module mode and import its declared export, for example:
`import { inspectPageState } from '/meu/presets.js';`. Connect loads presets; generated code
only needs the import.

## Output mode

Choose one output mode before generating code.

### Inline

Use Inline for temporary, one-off exploration implemented by a small, self-contained snippet. Return one complete async IIFE:

```js
(async () => {
  return runtimeStatus();
})()
```

Do not create files or declarations, and do not use imports or exports. Keep temporary hooks, timers, listeners, and retained Objective-C objects scoped to the IIFE and clean them up with `try/finally`. Return only values that Frida RPC can transport.

### Module

Use Module for larger code, relatively stable exploration, repeated execution, multiple callable operations, shared helpers, imports, reviewable artifacts, or a typed call contract. Write both files into the requested artifact directory:

```text
probe.js
probe.d.ts
```

Declare only module exports in `probe.d.ts`. Keep exported names and signatures consistent with `probe.js`, and add JSDoc for every exported method and parameter. Do not declare internal actions, helpers, or SDK globals.

A module may export multiple scenario or probe methods. Module top level must only define helpers and exports: do not perform business actions, retain lifecycle objects, or install persistent hooks while loading. Put behavior inside exported functions and clean up temporary hooks, listeners, timers, and retained objects before each function settles, because loading changed content does not unload older module versions.

`probe.js` is a standard JavaScript ES Module. Export every callable entry with named ESM syntax:

```js
export function inspectState() {
  // ...
}

export async function openTargetPage() {
  // ...
}
```

Never use CommonJS `exports.name = ...` or `module.exports`, and never use Frida `rpc.exports`. The shared iOS SDK agent owns `rpc.exports`; probe loading rejects these forms.

## Execution thread

- Do not assume the execution thread for generated code.
- `IOS.ui`, `IOS.input`, `IOS.wait.ui`, and UIKit Evidence own their required main-queue dispatch.
- For direct UIKit or another main-thread-only Objective-C API, wrap the work with `await IOS.runOnMainThread(() => ...)`.
- Keep non-UI work on its required queue when source or API contracts specify one; never move arbitrary business calls to the main queue merely because they use Objective-C.

## 1. Driver

Unless the caller specifies another initial scene, assume the App starts on its home page. Generate Driver code from that state to each requested scene. Resolve page and control identifiers from source instead of guessing. Prefer high-level input because it reproduces real user behavior; use routing or business methods only when the requested scenario explicitly requires them.

1. Read [references/driver-generation.md](references/driver-generation.md) and `sdk` declarations for `IOS.input`, plus `ui` and `wait` as needed. For direct business calls, also read `bridge`.
2. In Module mode, export only the entry methods the caller needs. In Inline mode, put the requested flow directly in the IIFE. One operation may compose multiple driver steps.
3. Stop a flow when an input or wait result has `ok: false`.

## 2. Override

Add Override code only when the requested condition cannot reasonably be established through normal App configuration or Driver actions. Override controls a test precondition; it does not drive the App or prove the result.

Read [references/override-generation.md](references/override-generation.md) and `sdk` declarations for `Override`. Read `bridge` when definitions or the action use Objective-C objects or business methods. Wrap the complete dependent Driver and Evidence work in one `Override.run(definitions, action)` call. Never install an Override at Module top level or leave one active after the generated operation settles.

## 3. Evidence

Add Evidence code only for evidence requested by the user or required to answer the runtime question. Read `sdk` declarations for `Probe.evidence`; read `bridge` when the action, getters, or hook callbacks directly use business classes or methods.

Treat an action as the smallest evidence boundary:

- one action may contain one call or multiple driver steps that express one intent;
- one generated operation may execute one or multiple actions;
- use the entire operation as one action when no smaller boundary is needed;
- define the action first, then wrap it with evidence;
- include the trigger and required completion wait inside `action`; use a bounded completion condition and propagate failure or timeout;
- use a concise, non-empty `actionDescription` as the sole aggregation key within the operation: unique per action execution (including repetitions), shared only by wrappers observing that same execution.

Read only the evidence references needed by the probe:

- Objective-C method execution or TAG-prefixed `NSLog`: [references/critical-chain-evidence.md](references/critical-chain-evidence.md);
- state snapshots before and after an action: [references/critical-state-evidence.md](references/critical-state-evidence.md);
- UIKit snapshots before and after an action: [references/critical-ui-evidence.md](references/critical-ui-evidence.md).

Generate evidence with the matching `Probe.evidence.withChainEvidence()`, `Probe.evidence.withStateEvidence()`, or `Probe.evidence.withUiEvidence()` wrapper. These APIs clean up their temporary instrumentation after the wrapped action returns, throws, or its Promise settles, so the wrapper leaves no active Hook or cleanup work behind. This guarantee applies to evidence instrumentation, not to effects produced by the wrapped business action.

## 4. Direct Frida

Prefer Driver, Override, and Evidence when they accurately express the request. Do not use Direct Frida merely because it is shorter.

Use `globalThis.ObjC` or other Frida Gum APIs for runtime work not covered by encapsulated capabilities, including calling App methods to read state, prepare conditions, or trigger business behavior. Use Driver to verify user interaction paths; direct calls verify behavior from the chosen code entry onward. Direct Frida may run alone or compose with Driver, Override, and Evidence.

Read [references/direct-frida-generation.md](references/direct-frida-generation.md). Read `bridge` (`frida-objc-bridge`) for Objective-C APIs and `gum` for native Frida APIs; read both when needed.

Follow native Frida semantics. Resolve Objective-C classes and selectors from source and ensure they are runtime-visible; do not claim access to pure Swift ABI symbols through `ObjC.classes`.

## Composition example

The helpers and definitions below represent source-resolved App code; `submitForm` and `waitForSubmissionCompleted` must throw on failed input or wait results.

```javascript
const description = 'Submit form under JP region #1';

await Override.run(definitions, () =>
  Probe.evidence.withUiEvidence(
    () => Probe.evidence.withStateEvidence(
      () => Probe.evidence.withChainEvidence(
        async () => {
          await submitForm();
          return await waitForSubmissionCompleted();
        },
        description,
        logTag,
        methodHooks,
      ),
      description,
      stateGetters,
    ),
    description,
    uiTargets,
  ),
);
```

Override stays active through both checkpoints and the completion wait. Shared descriptions aggregate evidence from the same action execution; chain stays innermost to exclude snapshot collection. Checkpoints are sequential, not simultaneous. Observe methods other than those replaced by Override; same-method composition is not currently guaranteed.

## Code generation constraints

Generated code runs in Frida: use the provided SDK globals and Frida APIs, without Node.js
built-ins or npm module resolution.

Imports must resolve within the Frida runtime; adjacent Host files are not loaded automatically.
Use relative source imports only when the code will be bundled before execution, as with presets.
