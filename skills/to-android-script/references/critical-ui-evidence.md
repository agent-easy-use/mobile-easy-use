# Critical UI Evidence

Use this evidence to compare focused-Window UI nodes immediately before and after one action.
The SDK automatically adds one App-window screenshot and visible element crops at both checkpoints.

## Define keyed UI paths

Give every observed node a stable `uiKey` and map it to an Android UI path. Paths support
`id::`, `text::`, `tag::`, and View getter steps.

```javascript
const uiTargets = {
  entryButton: [`id::${R.id.entry_button}`],
  valueInput: [`id::${R.id.dialog}`, `id::${R.id.value_input}`],
};
```

Each path is resolved from left to right: the first step searches from the root whose Window has
`hasWindowFocus()`, and every subsequent step searches within the View matched by the preceding
step. A focused Dialog is supported. Non-focused Windows are outside V1.

## Wrap the action

```javascript
return Probe.evidence.withUiEvidence(
  async () => {
    await tapEntryButton();
    await waitForFeatureReady();
  },
  'Open the feature entry',
  uiTargets
);
```

The SDK finds every keyed path before the action and again after a synchronous return,
throw, or returned Promise settles. `uiKey` is the stable key in the resulting `ui` object.
Bounds use absolute physical screen coordinates.

Evidence failures must not change App behavior or replace the action error.
Screenshot capture failures are recorded separately and do not replace the action result or error.
