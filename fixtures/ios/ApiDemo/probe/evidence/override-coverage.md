# Override ApiDemo coverage

Run each export from the platform's `probe/override/probe.js` separately. Require `passed: true`
and `navigation.returnedToMain: true`; inspect the named `result` checks or `oracle` on failure.
These probes execute native App methods and inspect native state, rather than merely checking SDK return values.

| Contract | Android export | iOS export | Assertions |
| --- | --- | --- | --- |
| Single method | `probeSingleOverride` | `probeInstanceOverride` | Replacement result, skipped original, restored native result and call count |
| Method selection | `probeExactOverload` | `probeClassOverride` | Exact Java overload leaves another overload original; Objective-C class method restores |
| Filter | `probeFilteredOverride` | `probeFilteredOverride` | Matching argument replaced; unmatched argument calls original once |
| Async scope | `probeAsyncCleanup` | `probeAsyncCleanup` | Replacement remains through Promise completion, then original restored |
| Callback contract | `probeMethodCallbacks` | `probeMethodCallbacks` | Native null return; factory receives receiver/arguments; false, non-boolean and throwing filter fall back; throwing factory falls back exactly once; restoration after every case |
| Method failures | `probeMethodFailures` | `probeMethodFailures` | Action throw/rejection preserves error; named invalid definitions check the expected error cause; separate partial-install rollback; invalid action/empty definitions rejected; restoration after every case; iOS requires selector prefix |
| Java overload paths | `probeMethodSelection` | — | All three overloads replaced with actual signatures; ambiguous/invalid/conflicting selection rejected; partial conflict rollback preserves existing replacement; throwing original called once |
| Field values | `probeFieldValues` | `probeFieldValues` | Exact mock object/array identity and full array contents; native scalar values and reference identity restored; static/inherited fields where supported; strings, arrays, objects, null; App writes remain possible; async return preserved |
| Field failures | `probeFieldFailures` | `probeFieldFailures` | Action throw/rejection, unsupported definitions and partial rollback; expected error cause and immediate restoration checkpoint after each failure; mixed methods/fields restore |
| Field isolation | `probeFieldIsolation` | `probeFieldTypes` | Assigning one instance leaves another unchanged; Android null references and repeated static scope; iOS additional integer widths, UInt64 maximum, float, NSNumber and NSDictionary |
| Object lifetimes | — | `probeFieldObjectLifetime` | Weak field points to the specified mock; native lifetime and cleanup across async action |
| Reference scopes | — | `probeFieldReferenceScopes` | Surviving/empty references, null replacement and repeated scope cleanup |
| Composition | `probeComposedOverride` | `probeComposedOverride` | Real input in baseline/override scopes; exact before/after values and original call counts; action runs once per group; three evidence types share each group description; native method restored |

Totals: **11 Android exports, 12 iOS exports**. Each matrix probe contains several assertions.

`probeComposedOverride` must produce exactly two evidence files, with distinct baseline/mock action descriptions.
Run `node fixtures/<platform>/ApiDemo/probe/evidence/verify-evidence.mjs override-composition-v1 <evidence.json>`
on each file to verify persisted state, UI screenshots and the exact chain events.

The fixture deliberately changes fields in selected actions to verify write-once behavior and unconditional
restoration. Production probes should use stable configuration fields as described in the SDK declarations.
Object restore checks compare native reference identity, including Android String/arrays and inherited storage.

This matrix covers the implemented contract. It does not claim support for simultaneous overrides of the
same field, generic Swift/native ABI replacement, arbitrary property setters, or unsupported ivar types.
The previously identified iOS inherited-method target scope and overlapping-method restoration issues
remain separate review items; these tests do not assert those behaviors are correct.
