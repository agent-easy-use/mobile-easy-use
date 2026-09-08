# Critical iOS State Evidence

Use this evidence to compare requested runtime values immediately before and after one action.

## Generate getters

Use one read-only getter per state and a source-qualified key that identifies its owner:

```javascript
const stateGetters = {
  'SearchModel#query': () => IOS.runOnMainThread(() => readCurrentQuery()),
  'SearchSession#query': () => {
    const query = ObjC.classes.SearchSession.sharedSession().query();
    return query == null ? null : query.toString();
  },
  'SearchViewModel#resultCount': () =>
    Number(ObjC.classes.SearchViewModel.sharedModel().resultCount()),
};
```

Resolve the owner deterministically from source through a singleton, manager, session, model, ViewModel, current ViewController, or another stable accessor. Do not use broad class enumeration, object-graph traversal, or heap scans merely to find an owner. Pure Swift state is unavailable unless exposed through an Objective-C-visible accessor or another exact native boundary.

Getters may return JSON or a Promise of JSON. Use `IOS.runOnMainThread` inside a getter when its source requires the main queue; do not return Objective-C objects.

## Wrap the action

```javascript
return Probe.evidence.withStateEvidence(
  async () => {
    await IOS.input.input('search_field', value);
    await waitForQueryApplied(value);
  },
  'Enter the search query',
  stateGetters,
);
```

The wrapper awaits getters sequentially before the action and again after a synchronous return, throw, or returned Promise settlement. It records two snapshots only; do not infer intermediate transitions. Getter failures are recorded in evidence and do not replace the action result or error.

Capture only state needed to answer the request. A missing checkpoint or getter failure is missing evidence, not proof that the value is null or unchanged.

Keep getters read-only and bound external waits. Results are serialized as JSON; read related fields together when consistency matters. Getter failures omit the checkpoint value and record `errors.before` or `errors.after`.
