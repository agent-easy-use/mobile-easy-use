---
name: to-android-test
description: Run existing Android mobile-easy-use tests from a natural-language request, recursively finding files in the requested directory and summarizing results.
---

# To Android Test

Accept a natural-language request such as “run the click tests under this directory.” Resolve the scope, recursively find test files, and execute them one by one through [to-android-run](../to-android-run/SKILL.md).

## Workflow

1. Resolve the App, directory, and requested behavior from the request and session. Default to the App's `tests/`; clarify only material ambiguity.
2. Recursively discover files with `rg --files`. Read test modules to identify relevant tests and starting/cleanup conditions. Exclude helpers, deduplicate paths, and sort by path. State the selected files, then proceed; report no matches without claiming success.
3. Read and follow `to-android-run`, using its `scriptPath + functionName` form: pass each module's absolute `scriptPath`, `functionName: "run"`, and `args: []`. Reuse the same target and MCP session; invoke each file once and await completion before the next file. No `.d.ts` is needed.
4. Continue after assertion failures when cleanup succeeded and the next starting conditions are established. Stop on cleanup failure, disconnect, operation timeout, or uncertain App state; mark remaining files unrun. Do not automatically retry or modify tests.

## Result

Show results in the reply first: list the first 10 cases in execution order (all cases if fewer), using ✅ for passed, ❌ for failed, and ⏭ for not run. Include the file and case name; briefly explain failures. Keep execution errors distinct from assertion failures.

Only when there are more than 10 cases, save the complete results to a report and link it after the inline list. Otherwise, do not create a report file unless requested.

Then summarize files and cases separately:

- Files: passed, failed, execution errors, and unrun.
- Cases: sum valid reports' `total`, `passed`, `failed`, and `notRun`. Count each case once; missing reports leave case counts unknown.
- Failures: identify file, case, phase, and reason; include available actual/expected values.

Use `response.result` Test reports, not transport success. Claim “all passed” only for a nonempty run where every selected file passed and nothing remains unrun. Preserve compatibility advisories from `to-android-run`.
