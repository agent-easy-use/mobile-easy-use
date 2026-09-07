# Chain Evidence

## Format

`actionDescription` identifies the observed action. `chain` contains method and log events in observation order.

Relevant section example:

```json
{
  "actionDescription": "Submit search",
  "chain": [
    {
      "type": "method",
      "className": "SearchService",
      "selector": "- submitQuery:",
      "phase": "enter",
      "capture": { "args": { "query": "shoes" } }
    },
    {
      "type": "log",
      "level": "default",
      "tag": "Search",
      "message": "[Search] request queued"
    },
    {
      "type": "method",
      "className": "SearchService",
      "selector": "- submitQuery:",
      "phase": "leave",
      "capture": {
        "result": { "accepted": true },
        "elapsedMs": 2.5,
        "memory": {
          "physicalFootprintBytes": { "unit": "bytes", "before": 1000000, "after": 1004096, "delta": 4096 }
        }
      }
    }
  ]
}
```

## Analysis

Read `chain` chronologically as observed: entry, intervening logs or nested calls, then completion.

- **Entry (`enter`)** identifies the class and selector; optional `capture.args` shows selected inputs.
- **Log (`log`)** provides level, TAG, and message as execution context.
- **Completion (`leave`)** identifies the returning method; optional `capture` provides the selected result,
  elapsed time, and before/after process memory changes. There is no generic Objective-C `throw` event.

Consult the method definition for capture details and failures; evaluate collection errors alongside values.
Observation order alone does not establish causality or pair overlapping calls. Logs may include unrelated
background work; missing events are inconclusive without a complete observation window. Explain only what
the evidence supports: method return is not async completion, and memory growth alone is not a leak.
