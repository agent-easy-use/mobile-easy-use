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
| Field values | `probeFieldValues` | `probeFieldValues` | Native scalar values and reference identity restored; static/inherited fields where supported; strings, arrays, objects, null; App writes remain possible; async return preserved |
| Field failures | `probeFieldFailures` | `probeFieldFailures` | Action throw/rejection, unsupported definitions and partial rollback; immediate restoration checkpoint after each failure; mixed methods/fields restore |
| Field isolation | `probeFieldIsolation` | `probeFieldTypes` | Assigning one instance leaves another unchanged; Android null references and repeated static scope; iOS additional integer widths, UInt64 maximum, float, NSNumber and NSDictionary |
| Object lifetimes | — | `probeFieldObjectLifetime` | Native lifetime and cleanup across async action |
| Reference scopes | — | `probeFieldReferenceScopes` | Surviving/empty references, null replacement and repeated scope cleanup |

Totals: **7 Android exports, 9 iOS exports**. Each matrix probe contains several assertions.

The fixture deliberately changes fields in selected actions to verify write-once behavior and unconditional
restoration. Production probes should use stable configuration fields as described in the SDK declarations.
Object restore checks compare native reference identity, including Android String/arrays and inherited storage.

This matrix covers the implemented contract. It does not claim support for simultaneous overrides of the
same field, generic Swift/native ABI replacement, arbitrary property setters, or unsupported ivar types.
The previously identified iOS inherited-method target scope and overlapping-method restoration issues
remain separate review items; these tests do not assert those behaviors are correct.
