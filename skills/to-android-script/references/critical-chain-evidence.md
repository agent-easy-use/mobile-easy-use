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

Add `capture` only when the question requires method inputs, return values, elapsed time, or memory
changes. Omit it when method execution and existing logs provide enough evidence. Select only the
needed capture options; consult the method definition for their configuration and constraints.

## Wrap the action

```javascript
return Probe.evidence.withChainEvidence(
  () => tapEntryButton(),
  'Open the feature entry',
  new Set(['FeatureFlow', 'FeatureRouter']),
  methodHooks
);
```

The arguments are `action`, `actionDescription`, optional `logTag`, and optional `methodHooks`. `logTag` accepts one string or a `Set<string>`; pass `undefined` when only method hooks are needed.

The wrapper installs hooks before the action and removes them after a synchronous return, throw, or returned Promise settles. Keep its scope short. Native TAG filtering happens before a matching log enters JavaScript.

The Android log hook matches TAGs by exact equality. It observes `__android_log_write_log_message` when that modern liblog symbol exists, otherwise it falls back to `__android_log_buf_write` for older Android releases. Only one entry is hooked, avoiding duplicate Java/Kotlin logs while covering matching native liblog traffic on modern Android. Every match writes Evidence immediately instead of waiting for the action to finish, so records emitted before a process crash remain available. Priorities map to `v`, `d`, `i`, `w`, `e`, or `f`. Do not generate regex, message predicates, or unbounded global logging.

Only one native TAG capture may be active at a time. Do not nest or concurrently run `withChainEvidence` calls that specify `logTag`. Logs are attributed by the action's attach/detach time window; unrelated background work using the same TAG may also be captured.

Method evidence uses `phase: "enter"`, `"leave"`, or `"throw"`. Keep messages and errors small and sanitized. Evidence failures must not change App behavior or replace the action error.
