# UI Evidence

## Format

The top-level `actionDescription` identifies the action. `ui` maps each `uiKey` to `{ className, before, after }`. Each checkpoint contains `exist`, `visible`, `bounds`, `properties`, and `screenshots.window` and `screenshots.element`. Bounds use absolute physical-screen coordinates.

Relevant section example:

```json
{
  "actionDescription": "Submit search",
  "ui": {
    "resultList": {
      "className": "androidx.recyclerview.widget.RecyclerView",
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
        "bounds": { "x": 0, "y": 180, "width": 1080, "height": 1740 },
        "properties": {},
        "screenshots": { "window": ".evidence/after.jpg", "element": ".evidence/resultList-after.jpg" }
      }
    }
  }
}
```

## Analysis

Compare both checkpoints. Use node data for exact state and screenshots for visual context. Missing, hidden, empty, or offscreen nodes have no element crop. Screenshots do not replace node data or prove business completion; View-drawn captures may omit SurfaceView, video, camera, or GL content. Treat missing checkpoints or capture failures as evidence gaps.
