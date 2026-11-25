# iOS drive — reach a scene

Drive performs user input and waits for the requested scene. Start from a known state. Direct App function calls may prepare or enter a scene, but only input validates the user interaction path.

Examples use illustrative App symbols and targets. Resolve them from the actual App before generating code. Use the SDK globals; do not import SDK internals. The [public declarations](../../../sdk/ios/index.d.ts) are authoritative. Code snippets belong inside an async IIFE or exported function, not module initialization.

## Public API

| Call (await each) | Purpose | Return |
| --- | --- | --- |
| `drive.click(target)` | Click | Input result |
| `drive.longPress(target)` | Long press | Input result |
| `drive.input(target, text)` | Append non-empty text | Input result |
| `drive.scroll(target, direction)` | Finger gesture: up/down/left/right | Input result |
| `drive.wait(target, state, options?)` | Wait for exists/visible/hidden/focused/enabled | Wait result |
| `drive.waitUntil(predicate, options?)` | Wait for a sync/async boolean condition | Wait result |

Input/wait results have `ok`; failures contain `error.code` and `error.message`. Success metadata varies by operation; consult declarations. Calls can also reject. Check failure before continuing. Input delivery is not proof of business completion; do not automatically retry uncertain input.

Wait options are `{timeoutMs, intervalMs}`, defaulting to 5000/100 ms. Do not invent clear/replace input, long-press duration, or scroll-distance arguments. Scroll direction is finger movement, not a semantic content direction.

## Targets

Use accessibility identifier strings, non-empty paths, UIView wrappers, or input-only screen coordinates `{x, y}` in points. Paths support `identifier::`, `label::`, `class::`; no Android getter steps. Lookup starts from the key window or first visible window. Virtual accessibility/SwiftUI nodes without a UIView are not searchable.

```js
const target = ['identifier::form', 'label::Submit'];
const view = await element.findUiView(target); // ObjC.Object or null
```

`element.findUiView` accepts IDs/paths on Android and identifiers/paths on iOS; coordinate input cannot be used for lookup or inspection. Public drive APIs own UI thread dispatch. Direct native operations on a resolved wrapper still follow platform thread requirements.

## Example: open a form and enter text

```js
const opened = await drive.click('open_form');
if (!opened.ok) throw new Error(opened.error.message);
const ready = await drive.wait('name_input', 'visible');
if (!ready.ok) throw new Error(ready.error.message);
const typed = await drive.input('name_input', 'Alice');
if (!typed.ok) throw new Error(typed.error.message);
return typed;
```

For asynchronous business work, wait on its actual state:

```js
const ready = await drive.waitUntil(() => readSubmissionCompleted(), {timeoutMs: 10000});
if (!ready.ok) throw new Error(ready.error.message);
```

Implement the read helper from App source using [direct Frida](direct-frida.md). Use [override](override.md) to establish dependency conditions and [inspect](inspect.md) to observe the scene. For failure diagnostics, capture inspect.ui.screenshotWindow explicitly, without replacing the primary failure if capture fails.
