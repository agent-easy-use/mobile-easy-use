# Critical Chain Evidence

Use this evidence to record critical method execution or Android liblog messages from one or more exact TAGs during one action.

## Select signals

Resolve every class, method, and overload from source. Hook only signals required by the probe, and prefer a business method or business logger over global Log when possible.

```javascript
const methodHooks = [
  {
    target: 'com.example.feature.FeatureRouter',
    method: 'open',
    argumentTypes: ['android.content.Context', 'java.lang.String'],
    filter(invocation) {
      return invocation.args[1]?.toString() === 'details';
    }
  }
];
```

`argumentTypes` is optional for a method with one overload. For multiple overloads, specify one exact `argumentTypes` list or explicit `allOverloads: true`.

Add a `filter` whenever receiver identity, arguments, or another cheap identifier can narrow calls. Keep it synchronous, read-only, and fast. Returning `false` skips evidence but still calls the original method; filter errors are treated as not matched.

Add `capture` only when the question requires method inputs, return values, call stacks, elapsed time, or memory
changes. Omit it when method execution and existing logs provide enough evidence. Select only the
needed capture options; consult the SDK declaration for their configuration and constraints.
`capture.stack: true` captures up to 5 entry frames; use `{maxFrames: n}` for a different limit.

Method and log events always include `threadName` (null when unavailable);

## Wrap the action

```javascript
return Probe.evidence.withChainEvidence(
  async () => {
    await tapEntryButton();
    await waitForFeatureReady();
  },
  'Open the feature entry',
  new Set(['FeatureFlow', 'FeatureRouter']),
  methodHooks
);
```

The arguments are `action`, `actionDescription`, optional `logTag`, and optional `methodHooks`. `logTag` accepts one string or a `Set<string>`; pass `undefined` when only method hooks are needed.

The wrapper installs hooks before the action and removes them after a synchronous return, throw, or returned Promise settles. Keep its scope short. Native TAG filtering happens before a matching log enters JavaScript.

TAG matching is exact. Matching Java/Kotlin and native liblog messages are streamed immediately,
with priorities `v`, `d`, `i`, `w`, `e`, or `f`; evidence may be incomplete if the process crashes.
Do not generate regex, message predicates, or unbounded global logging.

Only one native TAG capture may be active at a time. Do not nest or concurrently run `withChainEvidence` calls that specify `logTag`. Logs are attributed by the action's attach/detach time window; unrelated background work using the same TAG may also be captured.

Method evidence uses `phase: "enter"`, `"leave"`, or `"throw"`. Keep messages and errors small and sanitized. Evidence failures must not change App behavior or replace the action error.
