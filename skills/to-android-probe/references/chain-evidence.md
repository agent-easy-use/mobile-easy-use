# Chain Evidence

## Format

The top-level `actionDescription` identifies the action. `chain` is an ordered array. Method records contain `type: "method"`, `className`, `method`, and `phase`; `phase` is `enter`, `leave`, or `throw`, with `error` on throws. Log records contain `type: "log"`, `level`, `tag`, and `message`.

Relevant section example:

```json
{
  "actionDescription": "Open search",
  "chain": [
    {
      "type": "method",
      "className": "com.example.SearchRouter",
      "method": "open",
      "phase": "enter"
    },
    {
      "type": "log",
      "level": "d",
      "tag": "Search",
      "message": "page opened"
    }
  ]
}
```

## Analysis

Describe only observed events and the source branch they support. Array order is observation order, not proof of causality. A missing event is inconclusive unless the hook scope and action window make absence meaningful. TAG capture may include unrelated background logs emitted in the same window.
