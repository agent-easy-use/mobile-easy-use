# iOS override — help drive establish a scene

Temporarily change dependencies, then drive to the requested scene and inspect its behavior. Do not replace the business outcome being verified. Already consumed/cached values are not retroactively changed.

Examples use illustrative App symbols and targets. Resolve them from the actual App before generating code. Use the SDK globals; do not import SDK internals. The [public declarations](../../../sdk/ios/index.d.ts) are authoritative. Code snippets belong inside an async IIFE or exported function, not module initialization.

## Public API and lifetime

All three installers return `Promise<remove>`; remove is an idempotent async closure:

- `override.method(definition, returnInstead)` replaces matching method calls.
- `override.field(definition, value)` saves and assigns a field/property value.
- `override.code(definition, overrides?, earlyReturn?)` changes behavior at a code location.

Await removal in finally, after dependent driving, waits and inspection. Acquire new resources inside the cleanup boundary of prior acquisitions; a later installation failure must not leak earlier ones. Attempt every cleanup and preserve primary and cleanup errors. Removal ends future replacements; it does not undo business side effects or code-local writes. Field removal restores the saved value, overwriting intervening App changes.

## Method: supply a dependency result

```js
const remove = await override.method(
  {className: 'Features', selector: '- isEnabled:',
  filter: name => !name.isNull() && new ObjC.Object(name).toString() === 'checkout'},
  1,
);
try {
  const clicked = await drive.click('open_checkout');
  if (!clicked.ok) throw new Error(clicked.error.message);
  const ready = await drive.wait('checkout', 'visible');
  if (!ready.ok) throw new Error(ready.error.message);
  return await inspect.ui.isVisible('checkout');
} finally {
  await remove();
}
```

Definitions target className, including for instance methods. Filter receives positional method parameters, not an invocation object or receiver. Only true matches. returnInstead can be a fixed value or synchronous function with the same positional parameters:

```js
const remove = await override.method(
  {
  className: 'Checkout',
  selector: '- priceFor:',
  filter: quantity => quantity > 0,
},
  quantity => Number(quantity) * 10,
);
// Use through the dependent scenario, then await remove() in finally.
```

iOS uses exact selectors prefixed with - or +. Arguments/results use raw NativeCallback ABI values, not high-level ObjC conversion: numeric BOOL (1/0), pointers for objects, and ABI structs/64-bit values. The first example assumes BOOL return; the second assumes integer parameter/result. Object returns require valid native handles, not JS strings. Remove overlapping method watches/replacements in reverse order. Variadic methods/native exception unwinding are outside MVP.

Filter/replacement callbacks must be synchronous; errors fall back to the original method. Avoid recursively calling the replaced method.

## Field: establish a value

```js
const label = await element.findUiView('title');
if (label === null) throw new Error('Title label missing');
const remove = await common.runOnMainThread(() =>
  override.field({instance: label, property: 'text'}, 'Preview'));
try {
  const image = await inspect.ui.screenshotElement('title');
  return image.filePath;
} finally {
  await common.runOnMainThread(remove);
}
```

Field means an instance Objective-C property, not a raw ivar or static field. Getter/setter metadata handles custom accessor names and bridge conversion; readonly properties are unsupported. Both installation and removal must be dispatched for main-thread properties. The saved object is retained until removal, which may extend a weak property's original object's lifetime.

Avoid overlapping edits and fields the App actively updates during the scenario; restoration would overwrite those updates.

## Code: change locals or return early

```js
const definition = {
  kind: 'source', file: 'Checkout.m', line: 42,
  condition: 'quantity > 0',
};
const remove = await override.code(definition, {quantity: '2'});
try {
  await openFeature(); // Source-resolved trigger and bounded completion wait.
} finally {
  await remove();
}
```

The definition/condition follows [inspect.code](inspect.md). Overrides contain LLDB expression strings. Omit earlyReturn to continue; for an Objective-C object return, override.code(definition, undefined, '(id)nil') forces nil. Swift early return is unreliable and must not be generated as working functionality; use supported local-variable overrides instead. Resolve local names, types and executable locations from source/debug information. Removal does not reverse changes already made by a hit.
