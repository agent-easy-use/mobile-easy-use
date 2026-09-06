# State Evidence

## Format

The top-level `actionDescription` identifies the action. `state` maps each source-qualified path to `{ path, before, after, changed }`. Values are JSON-compatible snapshots; `changed` is derived from `before` and `after`.

Relevant section example:

```json
{
  "actionDescription": "Enter query",
  "state": {
    "SearchSession#query": {
      "path": "SearchSession#query",
      "before": "",
      "after": "codex",
      "changed": true
    }
  }
}
```

## Analysis

Compare both checkpoints and explain the source meaning of each path. Do not infer intermediate transitions. Do not rely on `changed` alone. A missing checkpoint or getter failure is missing evidence; when `null` may be a valid value, report the ambiguity.
