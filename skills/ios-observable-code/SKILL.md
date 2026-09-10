---
name: ios-observable-code
description: When writing or modifying iOS code, add minimal logs, stable UI identifiers, and runtime visibility for inspection with Mobile Easy Use.
---

# iOS Observable Code

Keep changes local and preserve behavior. Reuse existing logs, identifiers, and runtime entry points; avoid new dependencies or observability layers.

## Key-flow logs

- Log key flow boundaries and outcomes, including asynchronous completion. Keep logs sparse, free of sensitive data, and enabled in the inspected build.
- Use `NSLog` with a stable literal `[TAG] ` prefix, event, and relevant values:

  ```swift
  NSLog("[Form] completed count=%ld", results.count)
  ```

  ```objc
  NSLog(@"[Form] completed count=%ld", (long)results.count);
  ```

- `[%@]` prefixes also work when the first argument is an NSString matching the TAG. Capture requires Mobile Easy Use's iOS Runtime; Swift `print` and `os_log` are not captured.

## UI identifiers

- Assign stable `accessibilityIdentifier` values, such as `form.submit`, to relevant UIKit controls and result views. Distinguish repeated elements within their parent and preserve accessibility labels.
- Queries traverse UIViews; identifiers alone cannot expose SwiftUI or virtual accessibility elements without a UIView.

## Swift runtime visibility

Method-chain capture requires Objective-C runtime visibility:

- **Classes:** Prefer `NSObject` or UIKit subclasses. Use the runtime name, commonly `ModuleName.ClassName`; add `@objc(CustomName)` only for a fixed name. Class visibility does not expose all Swift methods.
- **Methods:** Use `@objc dynamic` on methods to inspect: `@objc` exposes the selector; `dynamic` routes Swift calls through Objective-C dispatch for hooks. Parameter and return types must be Objective-C-compatible; `@objcMembers` does not replace `dynamic`.

Prefer logs when exposing classes or methods requires broader changes.
