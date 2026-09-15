---
name: android-observable-code
description: When writing or modifying Android code, improve observability with minimal code changes. Reuse or add key-flow logs and stable UI identifiers so Mobile Easy Use can inspect runtime behavior, diagnose issues, and verify changes.
---

# Android Observable Code

Keep observability changes small and local to the requested work. Reuse existing logs and identifiers; preserve behavior and avoid adding dependencies or observability layers.

## Key-flow logs

- Add logs only at useful flow boundaries: entry, important branches, completion, and failure. For asynchronous work, log the actual outcome, not just task submission.
- Use a stable, exact TAG; put event names and relevant outcome values in the message. `Log.d(TAG, "...")` is a simple option. Existing logging wrappers are suitable when their output reaches Android `liblog` with that TAG, which Mobile Easy Use captures.
- Keep logs sparse and free of sensitive data. Ensure they remain enabled in the build used for inspection.

## UI identifiers

- Give relevant native Views stable resource IDs, such as `R.id.form_submit`. Reuse existing IDs; distinguish repeated elements within their parent scope.
- Mobile Easy Use also supports string View tags through `tag::` paths. Reuse suitable existing tags without overwriting tags used by application logic.
- Current queries traverse native Views, not the Compose semantics tree. A Compose test tag alone does not make an element addressable through these queries. Preserve user-facing accessibility text.
