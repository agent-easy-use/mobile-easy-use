# iOS Override Generation

Use Override only to establish a requested condition that normal App configuration or Driver actions cannot reasonably establish. V1 supports methods visible through the Objective-C Runtime; do not generate pure Swift ABI or native-symbol replacement.

## Define exact Objective-C methods

Use the same method-location structure as critical-chain method hooks, plus `withReturn`:

```javascript
const definitions = [{
  target: 'MyApp.RegionProvider',
  selector: '- regionForScene:',
  filter(invocation) {
    return invocation.args[0].toString() === 'search';
  },
  withReturn: 'JP',
}];
```

Resolve the runtime class and selector from source or runtime inspection. Every selector must include its exact `- ` instance-method or `+ ` class-method prefix; a missing prefix is an error. Do not guess Swift-to-Objective-C selectors.

`filter` is optional, synchronous, read-only, and fast. It receives `{ receiver, args, className, selector }`. When absent, every invocation is replaced. When it returns false, or throws, the original implementation is called.

`withReturn` is required. It may be a fixed Objective-C ABI-compatible replacement value or a synchronous function of the invocation that returns one. A matching invocation skips the original implementation. A throwing `withReturn` function is isolated by the SDK and falls back to one original call. Do not return a Promise.

## Temporarily assign fields

A field definition is `{ target: instance, field: '_enabled', withValue: true }` and may be mixed with method definitions. Use an Objective-C instance and an exact ivar name. Values are native scalars, prepared Objective-C objects (for example NSString), or null; property accessors and pure Swift fields are not supported. Use stable configuration or flow-control fields: the value is written once before action and restored afterward, overwriting any intervening App changes. Avoid fields the App changes during action, and do not overlap operations on the same field. Only use fields that permit access from the runtime thread.

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

`Override.run` installs all definitions before calling the action, rolls back partial installation failure, keeps them active until a returned Promise settles, and restores methods and fields in reverse order before returning or rethrowing. Return or await every asynchronous operation that depends on the Override.

Prefer the narrowest App-owned dependency boundary. Do not override the business decision or UIKit result being tested. Runtime Override cannot affect values already consumed during process startup or cached before installation; report that limitation instead of generating an ineffective replacement.
