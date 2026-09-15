# Critical iOS Chain Evidence

Use this evidence to record Objective-C method execution or TAG-prefixed `NSLog` messages during one action.

## Select signals

Resolve every class and selector from source or runtime inspection. Every selector must include its exact `- ` instance-method or `+ ` class-method prefix. Hook only signals required by the probe, and prefer an App-owned business selector or logger over broad UIKit methods.

```javascript
const methodHooks = [{
  target: 'FormViewController',
  selector: '- submit',
  filter(invocation) {
    return invocation.receiver.$className === 'FormViewController';
  },
}];
```

The optional filter is synchronous, read-only, and receives only `{ receiver, className, selector }`. It does not receive Objective-C arguments. Returning anything other than `true`, or throwing, skips evidence for that invocation while the original method continues.

Add `capture` only when the question requires method inputs, return values, call stacks, elapsed time, or memory
changes. Omit it when method execution and existing logs provide enough evidence. Select only the
needed capture options; consult the SDK declaration for their configuration and constraints.
`capture.stack: true` captures up to 5 entry frames; use `{maxFrames: n}` for a different limit.

Method and log events always include `threadName` (null when unavailable);

## Wrap the action

```javascript
return Probe.evidence.withChainEvidence(
  async () => {
    await IOS.input.click('submit');
    await waitForSubmissionCompleted();
  },
  'Submit the form',
  new Set(['Form', 'Network']),
  methodHooks,
);
```

The arguments are `action`, `actionDescription`, optional `logTag`, and optional `methodHooks`. Pass `undefined` when only method hooks are needed.

The wrapper installs all listeners before the action, rolls back partial installation failure, and removes listeners after a synchronous return, throw, or returned Promise settlement. Method evidence records `phase: "enter"` and `phase: "leave"`; it does not emit a synthetic Objective-C `throw` phase. Keep the action window short.

## NSLog TAG evidence

Capture observes `NSLog` only during the action. The format may begin with a static `[TAG] ` or dynamic `[%@]` prefix:

```objc
NSLog(@"[Network] request failed: %@", error.localizedDescription); // captured
NSLog(@"[%@]request failed", @"Network");                           // captured
```

TAG matching is exact and case-sensitive. For dynamic `[%@]`, the first variadic argument must be an `NSString` equal to the requested TAG. Other dynamic format shapes, `print`, `os_log`, and Swift `Logger` are outside this contract. Matching messages stream immediately with `level: "default"`, a separate `tag` field, and the leading `[TAG]` text. Original logging is preserved; evidence may be incomplete if the process crashes.

Only one TAG capture may be active at a time. Do not nest or concurrently run wrappers that specify `logTag`. Attribution uses the action window, so unrelated background work using the same TAG may also appear.

Keep messages and captured identifiers small and sanitized. Filter or evidence failures must not change App behavior or replace the action error.
