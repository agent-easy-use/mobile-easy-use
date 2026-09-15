---
name: to-android-test-script
description: Generate Android mobile-easy-use test modules for explicit expectations or confirmed probe findings. Writes files without executing them.
---

# To Android Test Script

Compose Driver, Override, Expect, and Direct Frida into repeatable tests. Reuse `to-android-probe-script` generation rules for actions and observations; compare observations with expectations through the collection's `expect`. Generate files only; do not connect or execute.

## Before generating code

- Call `get_sdk_declarations({"platform":"android"})`. Read `Test` and the required SDK APIs; read returned `bridge` declarations for Java work and `gum` for native Frida work.
- Resolve scenes, targets, and observations from App source. Derive expectations from requirements or confirmed behavior; clarify missing expectations that determine pass or fail.
- Reuse presets: resolve `presets.directory` in `.meu/config.json` (default `.meu/presets`), read the Android entry and relevant feature `index.d.ts` declarations, and import declared exports from `/meu/presets.js`.

## 1. Driver

Drive the App into the target scene and perform the tested interactions, following [Driver generation](../to-android-probe-script/references/driver-generation.md). Default to starting from home; put shared navigation in `beforeEach` and case-specific actions in `test`.

Prefer `AndroidExp.input`, await bounded completion waits, and assert input/wait results before continuing. Failure screenshots must preserve the original assertion failure.

## 2. Override

Temporarily replace method behavior or field values to establish conditions unavailable through normal configuration or Driver actions. Follow [Override generation](../to-android-probe-script/references/override-generation.md); do not replace the business result being tested.

Await `Override.run(definitions, action)` around all dependent actions, waits, and assertions. It restores overrides on success or failure. A scope completed in `beforeEach` does not remain active during `test`.

Use `beforeEach`/`afterEach` for shared state preparation and restoration; clean up manually installed hooks in `finally` or `afterEach`.

## 3. Expect

Assert the App outcome, not just action delivery:

- Prefer UI assertions for observable control state; use `toSatisfy` for native UI properties. Await assertions and wait for eventual state first.
- Use `toHaveElementScreenShot` for element appearance or `toHaveWindowScreenShot` for window appearance, with a separately reviewed baseline. Prefer baseline paths relative to the test module. Never update the baseline in the test.
- Use ordinary value assertions for business data, action results, or observations UI and screenshots cannot express.

## 4. Direct Frida

Read native properties, invoke App methods, prepare state, or drive advanced business entries when the SDK has no suitable interface. Follow [Direct Frida generation](../to-android-probe-script/references/direct-frida-generation.md), using `Java` or Gum APIs and passing observations to `expect`.

Use `AndroidExp.runOnMainThread` for direct native UI access; respect other APIs' required threads. Direct calls verify behavior from that entry onward; use Driver for user interaction paths.

## Test structure and output

Write ESM `.js` files in the requested directory, defaulting to the App's `tests/`. Name files after the tested behavior, such as `class-click.js`. Do not generate `.d.ts` files; `run` uses the SDK's existing Test collection signature.

Create one collection per file, register non-nested groups at top level, and directly export `run`. App actions belong in callbacks; cleanup must tolerate partial setup. Replace the example's names and assertion with the requested scenario:

```js
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };


describe('xxx', () => {
    beforeEach(async () => {
        // maybe hook
    });
    afterEach(async () => {
        // hook clear
    });
    test('test-1', async () => {
        // driver

        // expect
        expect(1).toBe(1);
    });
});
```

Files share the App and JS environment: run serially and restore state between cases.
