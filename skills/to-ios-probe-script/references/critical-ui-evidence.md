# Critical UIKit UI Evidence

Use this evidence to compare requested UIKit nodes immediately before and after one action. The SDK
automatically adds one App-window screenshot and visible element crops at both checkpoints.

## Define keyed UI paths

Give every observed node a stable `uiKey` and map it to an accessibility identifier string or native UI path:

```javascript
const uiTargets = {
  nextButton: 'next_button',
  resultLabel: ['identifier::result_container', 'label::Result'],
};
```

Paths support `identifier::` and `label::` steps. Each step searches descendants of the preceding match in order. The SDK owns focused-window selection, traversal, matching, and limits. Do not implement a second hierarchy walker in JavaScript or invent getter path steps.

## Wrap the action

```javascript
return Probe.evidence.withUiEvidence(
  async () => {
    await IOS.input.click('next_button');
    await waitForResultPageReady();
  },
  'Open the result page',
  uiTargets,
);
```

The wrapper resolves every target on the main queue before the action and again in `finally` after the action returns, throws, or its Promise settles. `uiKey` is the stable key in the aggregated `ui` object.

Each snapshot contains:

- `exist` and `visible`;
- absolute screen `bounds` when available;
- `properties.identifier`, `properties.label`, and `properties.value` when readable;
- `properties.userInteractionEnabled` when supported.

Capture failures must not replace the action result or error. Screenshot capture failures are recorded separately.
