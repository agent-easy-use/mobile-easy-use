# iOS inspect — observe a scene

Observe current UI state or events during a scenario. Select only evidence that answers the question. Read native fields/accessors with [direct Frida](direct-frida.md); there is no inspect.state API.

Examples use illustrative App symbols and targets. Resolve them from the actual App before generating code. Use the SDK globals; do not import SDK internals. The [public declarations](../../../sdk/ios/index.d.ts) are authoritative. Code snippets belong inside an async IIFE or exported function, not module initialization.

## log, method and code: shared lifecycle

`await inspect.log.watch(tags)`, `await inspect.method.watch(definition, options?)` and `await inspect.code.watch(definition, options?)` return a watcher containing only async current/stop methods.

- `await watcher.current()` returns cumulative records without clearing them.
- `await watcher.stop()` removes the observation and returns final cumulative records. Repeated stop is supported; current after stop fails.
- Both return `{ok, data, error}`: data is a record array, error is null on success or a string on failure. Installation can reject.

Install before the trigger and use bounded business completion. Stop in finally, including when driving fails. Check capture errors: capacity exhaustion or partial evidence cannot prove absence. Keep cleanup diagnostics alongside the primary error.

## Logs

```js
const watcher = await inspect.log.watch(['Checkout', 'Network']);
let final;
try {
  const clicked = await drive.click('submit');
  if (!clicked.ok) throw new Error(clicked.error.message);
  const ready = await drive.wait('result', 'visible');
  if (!ready.ok) throw new Error(ready.error.message);
  const progress = await watcher.current();
  if (!progress.ok) throw new Error(progress.error);
} finally {
  final = await watcher.stop();
  if (!final.ok) console.error(final.error);
}
if (!final.ok) throw new Error(final.error);
return final.data;
```

Multiple independent TAG subscriptions can coexist. Matching is exact, case-sensitive, without regex. Records contain timestamp, threadId, threadName, tag, level and message. iOS observes NSLog formats with a static [TAG] prefix or dynamic [%@] prefix whose first variadic argument is an NSString TAG. Level is null. Arbitrary print/os_log/Swift Logger are not captured. Background work using the same TAG may also appear.

## Method arguments and results

```js
const definition = {
  className: 'Checkout',
  selector: '- priceFor:',
  filter: quantity => quantity > 0,
};
const watcher = await inspect.method.watch(definition, {
  enter: ({args}) => ({quantity: Number(args[0])}),
  leave: ({result, exception}) => ({
    price: exception ? null : Number(result),
    error: exception ? String(exception) : null,
  }),
  stack: 5,
});
// Trigger and wait, then use current/stop with the lifecycle above.
```

Filters receive positional parameters. Enter receives receiver/args; leave receives receiver/args/result/exception. Both callbacks are synchronous and return Record<string, any>. Stack is a numeric maximum, not boolean. Without options, records still contain callId, timestamp, threadId/threadName, status and durationMs; enter/leave/stack require options. A still-running call may appear in a snapshot. CallId identifies one invocation, not an asynchronous trace.

The example assumes an integer parameter/result. Receiver is ObjC.Object, but args/result use raw NativeCallback ABI values, without high-level ObjC conversion: object pointers, numeric BOOL, and Frida ABI structs/64-bit types. Check a pointer for null before new ObjC.Object(pointer). Copy values immediately; retain/release objects needed later. Stop does not release user-retained objects. Variadic methods/native exception unwinding are outside MVP; exception is undefined. Overlapping method replacements/watches require reverse-order cleanup.

## Local variables and expressions

```js
const definition = {
  kind: 'source', file: 'Checkout.m', line: 42,
  condition: 'quantity > 0',
};
const watcher = await inspect.code.watch(definition, {
  capture: { quantity: 'quantity', next: 'quantity + 1' },
  stack: 5,
});
// Trigger and wait, then use current/stop with the lifecycle above.
```

Definitions identify `{kind: 'source', file, line}` or `{kind: 'address', address}`. Conditions and capture expressions are native LLDB expressions, not JS callbacks. Use the source language's syntax. Captures return JSON values through debugger transport. SDK attachment is automatic; current reads collected results rather than re-evaluating expressions.

Conditions are evaluated before recording. Resolve executable lines and available locals from actual debug information. Without options, records contain hitId, timestamp, threadId/threadName; capture and stack are optional. Code frames use sourceFile/line plus platform-specific method/function information. Stacks describe synchronous ancestry, not complete causal chains.

## UI: direct reads

UI APIs return promises of their value, not watcher-result envelopes. They own main-thread dispatch. Targets follow [drive](drive.md), excluding input coordinates.

| API | Result and meaning |
| --- | --- |
| isExisting/isVisible/isHidden/isFocused/isEnabled(target) | Boolean; missing targets return false, including isHidden |
| tree(target, depth?) | Node with className, native target, bounds, children; default depth 3 |
| layout(target) | Local bounds, unit px, scale |
| layoutInParent/layoutInWindow/layoutInScreen(target) | Reference bounds plus targetBounds in that space |
| screenshotWindow() | Current App-window image metadata and Host filePath |
| screenshotElement(target) | Element image metadata and Host filePath |
| screenshotElementInWindow(target, highlight?) | Owning window, highlighted by default; false omits border |

Visibility is geometric, not an occlusion check. Relative layouts do not clip the target. iOS layout and image dimensions use pixels even though drive coordinates use points. Screenshot metadata includes width/height/format/region and capturedAt; capture failures reject.

```js
const target = 'result';
const visible = await inspect.ui.isVisible(target);
const layout = await inspect.ui.layoutInWindow(target);
const image = await inspect.ui.screenshotElementInWindow(target);
return {visible, layout, screenshotPath: image.filePath};
```

A tree contains native wrappers; strip them before RPC:

```js
const tree = await inspect.ui.tree('form', 2);
function plain(node) {
  return {className: node.className, bounds: node.bounds, children: node.children.map(plain)};
}
return plain(tree);
```

Capture before/after checkpoints explicitly. Keep logs, calls, code hits and UI observations identifiable; correlate using known triggers/business identifiers instead of assuming timestamps imply causality. The same observations can feed general Test assertions or the screenshot matchers.
