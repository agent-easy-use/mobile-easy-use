# Android direct Frida — execute functions and read variables

Use native APIs independently or alongside drive/inspect/override: prepare data, call a route/business function, get an object for override.field, or read fields/accessors as observations. This is not limited to a fallback path. Direct calls verify behavior from that entry onward, not bypassed UI interactions.

Examples use illustrative App symbols and targets. Resolve them from the actual App before generating code. Use the SDK globals; do not import SDK internals. The [public declarations](../../../sdk/android/index.d.ts) are authoritative. Code snippets belong inside an async IIFE or exported function, not module initialization.

## Function calls and object state

```js
const Session = Java.use('com.example.Session');
const session = Session.getInstance();
const before = Number(session.requestCount.value);
session.refresh();
const completed = await drive.waitUntil(() => !session.isLoading());
if (!completed.ok) throw new Error(completed.error.message);
return {before, after: Number(session.requestCount.value)};
```

This assumes source confirms these members and their calling thread. Use `.value` for Frida fields; select exact overloads/class loaders as needed. Use Java.registerClass to implement Java interfaces.

Two reads do not reveal intermediate changes or form an atomic snapshot. Read related fields together when consistency matters. Local variables require [inspect.code](inspect.md), not arbitrary object access. A failed read is missing evidence, not unchanged/null state.

## Native UI properties

```js
const view = await element.findUiView(R.id.title);
if (view === null) throw new Error('Title missing');
const text = await common.runOnMainThread(() => {
  const value = view.getText();
  return value === null ? null : value.toString();
});
return {text};
```

Use common.runOnMainThread for direct UI access; only execution before the first await is guaranteed on main. Respect other business thread requirements rather than moving arbitrary calls to main. common.currentThreadName() reads the current calling thread without dispatch.

## Ownership and output

Read bridge/Gum declarations for native calls, hooks, pointers and ABI. Resolve symbols from source/runtime evidence. Bound enumeration and collection to the question. Clean temporary hooks, timers and owned native resources in finally; no module-load hooks or automatic retries of uncertain mutations.

Return plain data to Host, not arbitrary native wrappers. Copy values while valid, or explicitly retain/release borrowed objects needed later. Project before RPC transport and do not imitate internal evidence messages. Combine values with [inspect](inspect.md) records or screenshots without inventing a shared action wrapper.
