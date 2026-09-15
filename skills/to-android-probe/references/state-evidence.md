# State Evidence

## Format

The top-level `actionDescription` identifies the action. `state` maps each source-qualified path to `{ path, before?, after?, errors? }`. Returned values are serialized as JSON, including null. Getter failures omit the value and record a message in `errors.before` or `errors.after`. Compare `before` and `after` using the business meaning of each path.

Relevant section example:

```json
{
  "actionDescription": "Enter form text",
  "state": {
    "FormViewModel#text": {
      "path": "FormViewModel#text",
      "before": "",
      "after": "codex"
    }
  }
}
```

## Analysis

Compare both checkpoints and explain the source meaning of each path. Do not infer intermediate transitions. Equal checkpoints do not rule out intermediate changes. An absent checkpoint is missing evidence; consult its error when present. A successful null is a business value.
