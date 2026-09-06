# Mobile Observability

Contract version: 1

Keep generated or modified mobile App code easy to observe through small, local additions. Reuse
existing logs and UI identifiers when they are sufficient, and do not introduce state APIs,
manifests, or architecture layers solely for observability.

## Android

For Android code:

- Add concise `Log.d` calls only at critical points of the requested flow, such as entry,
  completion, and expected failure. Use an exact, stable TAG.
- Give relevant UI elements a resource ID or an equivalent stable semantic ID when one is absent.

## iOS

For iOS code:

- Add concise `NSLog` calls only at critical points of the requested flow, such as entry,
  completion, and expected failure. The format string must begin with a literal `[TAG] ` prefix.

  Objective-C:

  ```objc
  NSString *arg1 = @"first";
  NSString *arg2 = @"second";
  NSLog(@"[Search] arg1=%@ arg2=%@", arg1, arg2);
  ```

  Swift:

  ```swift
  let arg1 = "first"
  let arg2 = "second"
  NSLog("[Search] arg1=%@ arg2=%@", arg1, arg2)
  ```

- Set `accessibilityIdentifier` on relevant UIKit elements when one is absent.
- Hooks can reliably intercept only methods exposed to the Objective-C runtime. Mark Swift methods
  that must be hookable with `@objc` and use Objective-C-compatible dynamic dispatch as needed.
