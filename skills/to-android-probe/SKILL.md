---
name: to-android-probe
description: Investigate an Android App by generating and executing scripts to reach scenes, inspect runtime behavior, and answer questions from returned values.
---

# To Android Probe

Turn the user's runtime question into a generated script, controlled execution, and an answer grounded in its returned values. Keep implementation details out of the answer unless requested or needed to explain a failure.

## Workflow

1. Read [probe-script](../to-android-probe-script/SKILL.md) for generation and [run](../to-android-run/SKILL.md) for connection and execution.
2. Establish the target App, starting scene, requested behavior and information needed to answer the question. Resolve symbols, targets and navigation from App source or runtime observations. Ask only when missing information materially affects execution.
3. Generate the smallest script using drive to reach the scene, inspect to observe it, override to establish dependency conditions, and direct Frida for function calls or variable reads. Use only the capabilities needed. For Module output, use a task-specific directory under workspace artifacts/ unless another directory is supplied.
4. Return the values needed for the question. Follow the generation skill's serialization contract: ordinary objects are serialized by the transport; prefer extracting JSON-compatible business values from native objects before returning them.
5. Use the run skill to execute one Inline operation or one Module export per invocation. Preserve its connection, single-operation and retry rules.
6. Read the returned result or execution error and decide whether it answers the question. If the result includes an image path relevant to a visual question, inspect that image. There is no separate evidence-file analysis workflow or required chain/state/UI schema.
7. If more information is needed, generate a focused follow-up using the current known App state. Do not automatically retry failed or timed-out mutations; first confirm or restore the starting conditions.

## Interpret the result

The script's returned value is available in the tool response's result field. An execution error means the call failed; it does not prove that earlier App changes were rolled back. A returned value can itself contain an API failure, such as a drive or watcher result with ok: false; successful script execution alone does not mean the scenario succeeded.

Interpret data according to what the script actually collected. An object-description string is not the object's business state. Missing or failed observations do not prove absence; a method return or delivered input does not prove asynchronous completion. Use App source to explain material observations while distinguishing observed values from source-based inference.

Answer the user's question directly with the relevant returned values and any unresolved limitation. Do not force a call-chain narrative or expose raw tool responses and script details unless useful to the request. Do not claim a visual result from an image path without inspecting the image.
