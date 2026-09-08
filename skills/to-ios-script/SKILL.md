---
name: to-ios-script
description: Generate iOS mobile-easy-use runtime code as either a temporary inline async IIFE or a reusable ES module with matching TypeScript declarations. Use for runtime discovery, UIKit inspection, instrumentation, App driving, temporary Objective-C return overrides, scoped evidence, or other bounded Frida work; prefer Inline for small one-off exploration and Module for larger or relatively stable work.
---

# To iOS Script

Generate the smallest iOS runtime code that answers the requested runtime question. Prefer Driver for requested user-visible actions, use Override only when normal App configuration or Driver actions cannot establish a required condition, add Evidence only when needed to answer the question, and use Direct Frida only when the encapsulated capabilities are insufficient. Perform only the requested operations and collect only the required results. Generate code only; do not connect to a device or execute it.

## Common contract

Before generating Module code, inspect `docs/mobile-easy-use/presets.d.ts` when it exists. Reuse a preset export only when its declaration and source evidence explicitly establish iOS compatibility. Never import an export that depends on Android `Java`, `R`, or `AndroidExp`. Import compatible exports only from the stable Frida module path `/docs/mobile-easy-use/presets.js`:

```js
import { xxxx } from '/docs/mobile-easy-use/presets.js';
```

Do not read, modify, build, or copy the generated `docs/mobile-easy-use/presets.js`. Do not compute a relative import from `probe.js`; the Host file path and Frida module path are separate concepts. Inline code cannot import presets. When iOS compatibility is absent or unclear, generate the smallest local implementation instead.

Inspect the target repository whenever identifiers, selectors, runtime names, or business symbols are unknown. Never guess them. A probe loaded after a startup event cannot observe that past event; report the limitation unless the caller provides a load and resume sequence that installs the hook first.

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

Declare only module exports in `probe.d.ts`. Add JSDoc describing every exported method and parameter. Do not declare internal actions, helpers, or SDK globals.

A module may export multiple scenario or probe methods. Module top level must only define helpers and exports: do not perform business actions, retain lifecycle objects, or install persistent hooks while loading. Put behavior inside exported functions and clean up temporary hooks, listeners, timers, and retained objects before each function settles, because loading changed content does not unload older module versions.

`probe.js` is a standard ES Module. Export every callable entry with named ESM syntax:

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

- Objective-C method execution or TAG-prefixed `NSLog`: [references/critical-chain-evidence.md](references/critical-chain-evidence.md);
- state snapshots before and after an action: [references/critical-state-evidence.md](references/critical-state-evidence.md);
- UIKit snapshots before and after an action: [references/critical-ui-evidence.md](references/critical-ui-evidence.md).

Generate evidence with the matching `Probe.evidence.withChainEvidence()`, `Probe.evidence.withStateEvidence()`, or `Probe.evidence.withUiEvidence()` wrapper. These APIs clean up their temporary instrumentation after the wrapped action returns, throws, or its Promise settles, so the wrapper leaves no active Hook or cleanup work behind. This guarantee applies to evidence instrumentation, not to effects produced by the wrapped business action.

When multiple evidence types are needed, nest their wrappers with the same `actionDescription` so the action runs once and its evidence aggregates into one file.

```javascript
const description = 'Submit search #1';

await Probe.evidence.withUiEvidence(
  () => Probe.evidence.withStateEvidence(
    () => Probe.evidence.withChainEvidence(
      async () => {
        await doSomething();
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
);
```

Include only the wrappers needed. Keeping chain innermost excludes the outer state/UI snapshot collection from its observation window; checkpoints follow the nesting order rather than occurring simultaneously.

## 4. Direct Frida

Prefer Driver, Override, and Evidence when they accurately express the request. Do not use Direct Frida merely because it is shorter.

Use the native Objective-C bridge exposed as `globalThis.ObjC`, or other Frida Gum APIs, when the encapsulated capabilities are insufficient. Direct Frida may form a standalone probe or compose with Driver, Override, and Evidence.

Read [references/direct-frida-generation.md](references/direct-frida-generation.md) before generating Direct Frida code.

## SDK boundaries

The SDK provides these globals:

1. `ObjC`: native Frida Objective-C bridge for Objective-C Runtime-visible App, framework, and third-party APIs.
2. `IOS`: reusable main-queue dispatch, UIKit query, input, and wait extensions.
3. `Override`: action-scoped Objective-C method return substitution.
4. `Probe.evidence`: action-scoped Objective-C chain, state, and UIKit UI evidence.

Follow native Frida semantics. Do not claim access to pure Swift ABI symbols through `ObjC.classes`. Prefer encapsulated SDK capabilities when they preserve the requested semantics. Treat repeated iOS App-specific patterns as candidates for an explicitly iOS-compatible preset workflow, and repeated cross-App patterns as SDK extension candidates.

Before delivery, verify that every referenced symbol comes from source or the SDK, required Objective-C classes and selectors are runtime-visible, and no unrequested evidence or interaction was added. For Inline, verify the result is one complete async IIFE with no imports or exports. For Module, verify named standard ES Module exports, matching declarations, no top-level side effects, and operation-scoped cleanup.
