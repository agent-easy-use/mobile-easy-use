---
name: to-android-probe
description: Investigate an Android App through mobile-easy-use from a natural-language request by composing probe generation and execution. Use when the user wants to navigate to a page, observe a critical runtime chain, inspect state, verify UI changes, or answer another scoped Android runtime question without managing script or execution details.
---

# To Android Probe

Turn one natural-language Android runtime question into a generated probe, one controlled execution, and an evidence-backed answer. Keep code generation and execution details hidden unless the user asks for them.

## Workflow

1. Read the complete sibling `../to-android-script/SKILL.md` and follow its generation contract.
2. Read the complete sibling `../to-android-run/SKILL.md` and follow its connection and execution contract.
3. Resolve the requested target, starting scene, allowed interactions, and required chain, state, or UI evidence. Inspect the target App source and existing presets when symbols or navigation steps are unknown; never guess them. Ask only when missing information makes execution unsafe or materially ambiguous.
4. Use `to-android-script` to generate the smallest probe that answers the original question. Use a task-specific directory under the workspace `artifacts/` for Module output unless the user supplies another directory.
5. Use `to-android-run` to execute exactly one generated Inline operation or one Module export. Preserve its single-operation and no-unsafe-retry rules.
6. After execution returns, inspect its result and only the evidence files it returned. Read only the references matching the returned evidence types: [chain](references/chain-evidence.md), [state](references/state-evidence.md), or [UI](references/ui-evidence.md).
7. Relate observed runtime events to original App source, distinguish observed facts from source-based inference, and decide whether the question is answered.
8. If it is not answered, revise and execute another probe only when doing so is safe. Do not automatically retry a failed or timed-out operation that may have mutated App state; first restore or confirm a known starting scene.

## Result

Answer the user's original question directly, then support the conclusion with one coherent account of the call outcome, runtime evidence, and original App source. Use only the evidence types relevant to the question; do not force chain, state, and UI sections when they were not requested or returned.

The operation returns exactly one of `result` or `error` plus `evidence`. Each evidence item identifies one action and a JSON file shaped as `{ actionDescription, chain: [], state: {}, ui: {} }`.

Build the answer from:

1. **Call outcome:** Explain the business meaning of `result`, or the phase and message of `error`. They are mutually exclusive. On failure, use evidence already emitted, but do not claim the operation completed or later state was reached.
2. **Chain evidence**, **State evidence**, and **UI evidence:** Apply only the references matching returned evidence.
3. **Source correlation:** Inspect the original App source behind every material class, method, state path, resource ID, and UI component. Use source to interpret runtime evidence, never to replace it.

Synthesize these inputs as a causal narrative when the evidence supports one: requested action -> observed chain -> state transition -> UI transition -> call `result` or `error`. Reconcile contradictions explicitly instead of selecting only the evidence that fits. Label runtime observations as observed facts, code-based explanations as source-based inference, and expected-but-unobserved behavior as unverified.

Close with material evidence gaps, alternative explanations, and confidence when the answer is not fully established. Do not expose generated probe code, MCP arguments, raw responses, or evidence paths unless requested or needed to explain a failure.
