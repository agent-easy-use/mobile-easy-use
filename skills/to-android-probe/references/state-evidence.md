# State Evidence

## Format

The top-level `actionDescription` identifies the action. `state` maps each source-qualified path to `{ path, before, after }`. Values are JSON-compatible snapshots. Compare `before` and `after` using the business meaning of each path.

Relevant section example:

```json
{
  "actionDescription": "Enter query",
  "state": {
    "SearchViewModel#query": {
      "path": "SearchViewModel#query",
      "before": "",
      "after": "codex"
    }
  }
}
```

## Analysis

Compare both checkpoints and explain the source meaning of each path. Do not infer intermediate transitions. Equal checkpoints do not rule out intermediate changes. A missing checkpoint or getter failure is missing evidence; when `null` may be a valid value, report the ambiguity.
