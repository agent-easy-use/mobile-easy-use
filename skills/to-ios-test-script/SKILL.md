---
name: to-ios-test-script
description: Generate iOS mobile-easy-use test modules for explicit expectations or confirmed probe findings. Writes files without executing them.
---

# To iOS Test Script

Turn a runtime question with a known expected outcome into a repeatable test using drive, inspect, optional override, and Test.create().expect. Generate files only; do not connect or execute.

## Contracts and preparation

Call get_sdk_declarations({"platform":"ios"}), read Test and the APIs used, plus bridge/Gum for native work. Follow [probe generation](../to-ios-probe-script/SKILL.md) for runtime constraints, preset compatibility, threading and observation lifetime.

Resolve targets, scenes and observations from source. Establish expectations from requirements or confirmed behavior; clarify missing expectations that determine pass/fail. Prepare a known scene instead of assuming home.

## Test behavior

- Follow [drive](../to-ios-probe-script/references/drive.md). Await and check input/wait results, then assert the business outcome. Delivery alone is insufficient.
- Install [watchers](../to-ios-probe-script/references/inspect.md) before triggering behavior. Assert capture success before interpreting records; wait for bounded business completion instead of fixed sleeps.
- Read UI state with inspect.ui and use general value matchers. Read native UI properties through common.runOnMainThread.
- Await expect(target).toMatchElementScreenshot(baseline) or expect().toMatchWindowScreenshot(baseline) for visuals. Use separately reviewed baselines, never the current output as its own expected image.
- Follow [override](../to-ios-probe-script/references/override.md). Await installation and removal; do not replace the outcome being tested.

Use beforeEach/afterEach for shared setup/cleanup; expect is available in hooks. Check necessary preconditions without repeating assertions everywhere. Save handles acquired in beforeEach for afterEach. Cleanup must tolerate partial setup, attempt every acquired resource and preserve primary and cleanup failures.

SDK regression tests use public APIs under test, with native fixture setup/verification independent of that API. A drive.click regression must not use drive.click to prepare its target. Ordinary App tests may use drive for navigation.

## Output

Write ESM .js files in the requested directory, defaulting to App tests/. SDK regression subdirectories match SDK directories: drive, inspect, override, element, common. Name files/tests by behavior. No test .d.ts is needed.

Create one collection per file and export run. Register non-nested groups at top level; App work belongs in callbacks. The following sketch requires source-resolved resetCounter/readCounter helpers and target; generated output must provide actual implementations:

```js
const { describe, test, beforeEach, expect, run } = Test.create();
export { run };

describe('Submit counter', () => {
  beforeEach(async () => {
    await resetCounter();
  });

  test('one click increments the counter once', async () => {
    const clicked = await drive.click(target);
    expect(clicked.ok, 'Click succeeds').toBe(true);
    const completed = await drive.waitUntil(async () => (await readCounter()) > 0);
    expect(completed.ok, 'Native handler completed').toBe(true);
    expect(await readCounter(), 'Counter increments exactly once').toBe(1);
  });
});
```

Files share App/JS state. Run serially and restore changed state between cases. Avoid generic lifecycle registries, vacuous assertions and SDK E2E mocks. Report generated files and prerequisites without claiming execution passed.
