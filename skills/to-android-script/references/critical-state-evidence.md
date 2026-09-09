# Critical State Evidence

Use this evidence to compare requested runtime values immediately before and after one action. State may be a variable, field, flag, counter, model value, ViewModel value, session value, or derived business status.

## Generate getters

Generate one read-only getter per state. Use a source-qualified variable or state path as the map key. A getter may return JSON or a Promise of JSON. Use `AndroidExp.runOnMainThread` inside a getter when its source requires the main thread.

```javascript
const stateGetters = {
  'FormModel#text': () => AndroidExp.runOnMainThread(() => readCurrentText()),
  'com.example.feature.FeatureManager#requestCount': () => {
    const manager = getFeatureManager();
    const count = manager.getRequestCount();
    return count == null ? null : Number(count);
  },
  'com.example.feature.FeatureSession#phase': () =>
    getFeatureSession()?.getPhase()?.toString() ?? null,
  'com.example.feature.FeatureViewModel#uiState': () => {
    const viewModel = findCurrentFeatureViewModel();
    const state = viewModel?.getUiState();
    return state == null ? null : { type: state.getType().toString() };
  }
};
```

Prefer a stable accessor or directly readable field. Use exact reflection for a known private instance field only when no accessor exists.

Resolve the state owner from source through a known static field, singleton, manager, repository, session, model or ViewModel, current Activity or Fragment, or another deterministic accessor. If the owner cannot be resolved deterministically, do not use broad field, object-graph, or heap scans.

Method-local variables cannot be captured by before/after getters. V1 can observe them only when they are exposed as method arguments or results; otherwise report that the value is unavailable.

## Wrap the action

```javascript
return Probe.evidence.withStateEvidence(
  async () => {
    await tapEntryButton();
    await waitForFeatureReady();
  },
  'Open the feature entry',
  stateGetters
);
```

The wrapper awaits getters sequentially before the action and again after a synchronous return, throw, or returned Promise settles. It does not capture intermediate transitions and preserves the action result or error.

State evidence does not require chain hooks. A getter failure must not change App behavior or replace the action error.

Keep getters read-only and bound external waits. Results are serialized as JSON; read related fields together when consistency matters. Getter failures omit the checkpoint value and record `errors.before` or `errors.after`.
