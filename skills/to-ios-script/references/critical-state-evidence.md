# Critical iOS State Evidence

Use this evidence to compare requested synchronous runtime values immediately before and after one action.

## Generate getters

Use one read-only getter per state and a source-qualified key that identifies its owner:

```javascript
const stateGetters = {
  'SearchSession#query': () => {
    const query = ObjC.classes.SearchSession.sharedSession().query();
    return query == null ? null : query.toString();
  },
  'SearchViewModel#resultCount': () =>
    Number(ObjC.classes.SearchViewModel.sharedModel().resultCount()),
};
```

Resolve the owner deterministically from source through a singleton, manager, session, model, ViewModel, current ViewController, or another stable accessor. Do not use broad class enumeration, object-graph traversal, or heap scans merely to find an owner. Pure Swift state is unavailable unless exposed through an Objective-C-visible accessor or another exact native boundary.

Getters must be synchronous, read-only, JSON-compatible, and safe on the current thread. Do not return Objective-C objects. Use UIKit UI evidence instead of reading UIKit state from a getter that would require asynchronous main-queue dispatch.

## Wrap the action

```javascript
return Probe.evidence.withStateEvidence(
  () => IOS.input.input('search_field', value),
  'Enter the search query',
  stateGetters,
);
```

The wrapper evaluates every getter before the action and again after a synchronous return, throw, or returned Promise settlement. It records two snapshots only; do not infer intermediate transitions. Getter failures are reported separately and do not replace the action result or error.

Capture only state needed to answer the request. A missing checkpoint or getter failure is missing evidence, not proof that the value is null or unchanged.
