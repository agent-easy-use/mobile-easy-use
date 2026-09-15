# Android Override Generation

Use Override only to establish a requested condition that normal App configuration or Driver actions cannot reasonably establish. Override changes a dependency input; Probe observes the resulting behavior.

## Define exact Java methods

Use the same method-location structure as critical-chain method hooks, plus `withReturn`:

```javascript
const definitions = [{
  target: 'com.example.env.RegionProvider',
  method: 'getRegion',
  argumentTypes: ['java.lang.String'],
  filter(invocation) {
    return String(invocation.args[0]) === 'form';
  },
  withReturn: 'JP',
}];
```

Resolve every class, method, and overload from source. `argumentTypes` is optional for a method with one overload. For multiple overloads, specify one exact `argumentTypes` list or explicit `allOverloads: true`; never use both. Use `allOverloads` only when the same replacement is valid for every selected return type.

`filter` is optional, synchronous, read-only, and fast. When absent, every invocation of the selected overload is replaced. When it returns false, or throws, the original method is called.

`withReturn` is required. It may be a fixed replacement value or a synchronous function of `{ receiver, args, argumentTypes }` that returns the replacement value. A matching invocation skips the original method. A throwing `withReturn` function is isolated by the SDK and falls back to one original call. Do not return a Promise.

## Temporarily assign fields

A field definition is `{ target: instance, field: 'enabled', withValue: true }` and may be mixed with method definitions. Use an instance wrapper for instance fields, or a class name/wrapper for static fields. Use stable configuration or flow-control fields: the value is written once before action and restored afterward, overwriting any intervening App changes. Avoid fields the App changes during action, and do not overlap operations on the same field. Only use fields that permit access from the runtime thread.

## Scope the scenario

```javascript
return Override.run(definitions, async () => {
  return Probe.evidence.withUiEvidence(
    () => openTargetPage(),
    'Open target page under JP region',
    uiTargets,
  );
});
```

`Override.run` installs all definitions before calling the action, rolls back partial installation failure, keeps them active until a returned Promise settles, and restores them in reverse order before returning or rethrowing. Return or await every asynchronous operation that depends on the Override.

Prefer the narrowest App-owned dependency boundary. Do not override the business decision or UI result being tested. Runtime Override cannot affect values already consumed during process startup or cached before installation; report that limitation instead of generating an ineffective hook.
