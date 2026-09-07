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
      "className": "com.example.SearchService",
      "method": "submitQuery",
      "phase": "enter",
      "capture": { "args": { "query": "shoes" } }
    },
    {
      "type": "log",
      "level": "d",
      "tag": "Search",
      "message": "request queued"
    },
    {
      "type": "method",
      "className": "com.example.SearchService",
      "method": "submitQuery",
      "phase": "leave",
      "capture": {
        "result": { "accepted": true },
        "elapsedMs": 2.5,
        "memory": {
          "javaHeapUsedBytes": { "unit": "bytes", "before": 1000000, "after": 1004096, "delta": 4096 }
        }
      }
    }
  ]
}
```

## Analysis

Read `chain` chronologically as observed: entry, intervening logs or nested calls, then completion.

- **Entry (`enter`)** identifies the class and method; optional `capture.args` shows selected inputs.
  Optional `capture.stack` shows the synchronous Java entry stack; it may be truncated and does not establish async causality.
- **Log (`log`)** provides level, TAG, and message as execution context.
- **Completion (`leave`)** identifies the returning method; optional `capture` provides the selected result,
  elapsed time, and before/after process memory changes. A `throw` instead records the original error and optional timing/memory, without a result.

Consult the method definition for capture details and failures; evaluate collection errors alongside values.
Method/log `threadName` may be null or shared by different threads; it cannot uniquely pair calls.
Observation order alone does not establish causality or pair overlapping calls. Logs may include unrelated
background work; missing events are inconclusive without a complete observation window. Explain only what
the evidence supports: method return is not async completion, and memory growth alone is not a leak.
