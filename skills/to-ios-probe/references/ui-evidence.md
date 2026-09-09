# UI Evidence

## Format

The top-level `actionDescription` identifies the action. `ui` maps each `uiKey` to `{ className, before, after }`. Each checkpoint contains `exist`, `visible`, `bounds`, `properties`, and `screenshots.window` and `screenshots.element`. Properties may include `identifier`, `label`, `value`, and `userInteractionEnabled`; bounds use absolute screen coordinates.

Relevant section example:

```json
{
  "actionDescription": "Submit form",
  "ui": {
    "resultLabel": {
      "className": "UILabel",
      "before": {
        "exist": false,
        "visible": false,
        "bounds": null,
        "properties": {},
        "screenshots": { "window": ".evidence/before.jpg", "element": null }
      },
      "after": {
        "exist": true,
        "visible": true,
        "bounds": { "x": 20, "y": 100, "width": 322, "height": 52 },
        "properties": { "identifier": "result_label", "label": "Result" },
        "screenshots": { "window": ".evidence/after.jpg", "element": ".evidence/resultLabel-after.jpg" }
      }
    }
  }
}
```

## Analysis

Compare both checkpoints. Use node data for exact UIKit state and screenshots for visual context. Missing, hidden, empty, or offscreen nodes have no element crop. Screenshots do not replace node data or prove business completion or physical input delivery; captures may omit protected or system-owned content. Treat missing checkpoints or capture failures as evidence gaps.
