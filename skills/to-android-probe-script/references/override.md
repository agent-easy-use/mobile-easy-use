# Android override — help drive establish a scene

Temporarily change dependencies, then drive to the requested scene and inspect its behavior. Do not replace the business outcome being verified. Already consumed/cached values are not retroactively changed.

Examples use illustrative App symbols and targets. Resolve them from the actual App before generating code. Use the SDK globals; do not import SDK internals. The [public declarations](../../../sdk/android/index.d.ts) are authoritative. Code snippets belong inside an async IIFE or exported function, not module initialization.

## Public API and lifetime

All three installers return `Promise<remove>`; remove is an idempotent async closure:

- `override.method(definition, returnInstead)` replaces matching method calls.
- `override.field(definition, value)` saves and assigns a field/property value.
- `override.code(definition, overrides?, earlyReturn?)` changes behavior at a code location.

Await removal in finally, after dependent driving, waits and inspection. Acquire new resources inside the cleanup boundary of prior acquisitions; a later installation failure must not leak earlier ones. Attempt every cleanup and preserve primary and cleanup errors. Removal ends future replacements; it does not undo business side effects or code-local writes. Field removal restores the saved value, overwriting intervening App changes.

## Method: supply a dependency result

```js
const remove = await override.method(
  {className: 'com.example.Features', method: 'isEnabled', argumentTypes: ['java.lang.String'],
  filter: name => String(name) === 'checkout'},
  true,
);
try {
  const clicked = await drive.click(R.id.open_checkout);
  if (!clicked.ok) throw new Error(clicked.error.message);
  const ready = await drive.wait(R.id.checkout, 'visible');
  if (!ready.ok) throw new Error(ready.error.message);
  return await inspect.ui.isVisible(R.id.checkout);
} finally {
  await remove();
}
```

Definitions target className, including for instance methods. Filter receives positional method parameters, not an invocation object or receiver. Only true matches. returnInstead can be a fixed value or synchronous function with the same positional parameters:

```js
const remove = await override.method(
  {
  className: 'com.example.Checkout',
  method: 'priceFor',
  argumentTypes: ['int'],
  filter: quantity => quantity > 0,
},
  quantity => Number(quantity) * 10,
);
// Use through the dependent scenario, then await remove() in finally.
```

Android uses method/argumentTypes; specify an exact overload when ambiguous. Arguments/results use Java bridge conversion. An existing implementation prevents another replacement or method watcher on the same method.

Filter/replacement callbacks must be synchronous; errors fall back to the original method. Avoid recursively calling the replaced method.

## Field: establish a value

```js
const remove = await override.field({className: 'com.example.Flags', field: 'enabled'}, true);
try {
  await openFeature();
} finally {
  await remove();
}
```

For an instance field, use `{instance: flags, field: 'enabled'}` instead. className and instance are mutually exclusive. Values are assigned through Frida Java fields with bridge conversion. Resolve the instance using an App accessor; do not pass a class wrapper as an instance.

Avoid overlapping edits and fields the App actively updates during the scenario; restoration would overwrite those updates.

## Code: change locals or return early

```js
const definition = {
  className: 'com.example.Checkout', method: 'calculate',
  argumentTypes: ['int'], fileLine: 42,
  condition: context => context.get('quantity') > 0,
};
const remove = await override.code(definition, {quantity: 2});
try {
  await openFeature(); // Source-resolved trigger and bounded completion wait.
} finally {
  await remove();
}
```

The definition/condition follows [inspect.code](inspect.md). Overrides contain Frida/JS values. Omitted or undefined earlyReturn means continue; null explicitly returns null. For a compatible object-return method, override.code(definition, undefined, null) forces a null return. Resolve local names, types and executable locations from source/debug information. Removal does not reverse changes already made by a hit.
