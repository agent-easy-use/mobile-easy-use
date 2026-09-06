# Chain Evidence

## Format

The top-level `actionDescription` identifies the action. `chain` is an ordered array. Method records contain `type: "method"`, `className`, `selector`, and `phase`; `phase` is `enter` or `leave`. Log records contain `type: "log"`, `level: "default"`, `tag`, and `message`.

Relevant section example:

```json
{
  "actionDescription": "Submit search",
  "chain": [
    {
      "type": "method",
      "className": "SearchViewController",
      "selector": "- submit",
      "phase": "enter"
    },
    {
      "type": "log",
      "level": "default",
      "tag": "Search",
      "message": "[Search] request started"
    }
  ]
}
```

## Analysis

Describe only observed selectors and TAG-prefixed `NSLog` messages and the source branch they support. Array order is observation order, not proof of causality. A missing event is inconclusive unless the hook scope, exact TAG contract, and action window make absence meaningful. TAG capture may include unrelated background logs emitted in the same window.
