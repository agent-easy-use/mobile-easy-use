---
name: ios-observable-code
description: When writing or modifying iOS code, improve observability with minimal code changes. Reuse or add key-flow logs and stable UI identifiers so Mobile Easy Use can inspect runtime behavior, diagnose issues, and verify changes.
---

# iOS Observable Code

Keep observability changes small and local to the requested work. Reuse existing logs and identifiers; preserve behavior and avoid adding dependencies or observability layers.

## Key-flow logs

- Add logs only at useful flow boundaries: entry, important branches, completion, and failure. For asynchronous work, log the actual outcome, not just task submission.
- Prefer a stable literal `[TAG] ` prefix in the `NSLog` format string, with event names and relevant outcome values in the message:

  ```swift
  NSLog("[Form] completed count=%ld", results.count)
  ```

  ```objc
  NSLog(@"[Form] completed count=%ld", (long)results.count);
  ```

- Existing `NSLog` formats beginning with `[%@]` are also supported when the first argument is an NSString matching the TAG. Mobile Easy Use's log capture requires its iOS Runtime and does not capture Swift `print` or `os_log`.
- Keep logs sparse and free of sensitive data. Ensure they remain enabled in the build used for inspection.

## UI identifiers

- Give relevant UIKit controls and result views stable `accessibilityIdentifier` values, such as `form.submit`. Reuse existing identifiers; distinguish repeated elements within their parent scope. Preserve user-facing accessibility labels.
- Current queries traverse UIViews. SwiftUI or virtual accessibility elements without a corresponding UIView are not addressable through these queries merely by adding an identifier.

## Method visibility

Method-chain capture uses Objective-C runtime-visible methods. Prefer existing entry points. Only when method-level inspection is needed, consider a small, Objective-C-compatible Swift entry point with `@objc dynamic`; pure Swift methods are not covered by this hook API. Prefer logs when exposing a method would require broader changes.
