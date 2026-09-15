# Mobile Easy Use

**A tool for Android and iOS developers that gives AI agents runtime access to understand, explore, debug, and run automated UI tests for apps.**

Documentation: **English** · [简体中文](./docs/README.zh.md) · [Français](./docs/README.fr.md) · [Русский](./docs/README.ru.md) · [Español](./docs/README.es.md) · [العربية](./docs/README.ar.md)

Compared with Web development, inspecting a mobile app's internal data, business state, and execution is harder. **“The data request succeeded—why didn't the list update?”** Questions like this depend on actual data, state, and timing that static source analysis alone often cannot explain.

Mobile Easy Use gives AI agents runtime access through MCP, connecting source code with actual app behavior so development decisions can rely on runtime evidence.

https://github.com/user-attachments/assets/e956fdbf-da6a-4608-a877-11a107f70760

## Explore app state and behavior

Agents can connect what users see with what happens inside the app to understand its behavior and investigate problems:

| Runtime information | What it tells you |
| --- | --- |
| Business objects and state | Current data, caches, configuration, and business state, including changes after an action |
| Method calls | Which methods run, their arguments, return values, call stacks, and execution threads |
| Execution time and memory changes | Method duration and process memory changes around calls |
| Business logs | How far execution progresses and what clues point to a failure |
| UI and control state | Control presence, visibility, position, and properties |
| Window and element screenshots | Actual appearance and visual changes after an action |
| App resources | Resource identifiers and contents associated with Android controls and configuration |
| Operation results and failure context | Where an action fails and the state, logs, and images captured at that point |

Available information depends on the platform and app implementation.

These observations support the agent throughout the coding loop:

- **Research and before coding:** Trace actual calls, data, and state alongside source code to understand the implementation.
- **Validate a technical approach:** Temporarily change configuration, fields, or method returns to test key assumptions, then restore them.
- **Investigate problems:** Connect call chains, business state, and UI behavior to locate the failure.
- **After coding:** Rerun the original scenario to check the change. Confirmed expectations can become regression tests.

For example, ask the agent to validate an approach:

```text
Inspect this page controlled by a configuration flag: check its current
configuration and actual call path, then temporarily toggle the flag
and verify data and UI in both states. Restore it when finished.
Use the evidence to assess the approach and identify what remains unverified.
```

## Also used for UI automation testing

The same runtime capabilities enable deeper UI automation: click, type, and scroll, then verify **UI state, screenshots, and native business state** in one test. After refreshing a list, for example, check both the displayed content and the underlying data. Temporary overrides help establish test conditions; call and state evidence help explain failures.

The comparison below covers testing centered on UI interactions and interface assertions:

| Testing task | UI-focused testing | Mobile Easy Use |
| --- | --- | --- |
| Verify an operation | Check visible text, controls, and screenshots | Also assert native objects, caches, and business state after the same operation |
| Test intermediate state | Wait for changes exposed through the UI | Read internal state to check transitions such as loading, pending, or completed |
| Set up a scenario | Reach the state through UI steps and available test data | Also temporarily override fields or method returns to exercise specific branches |
| Investigate a failure | Inspect failed assertions, screenshots, and available logs | Also trace method calls, arguments, return values, and state changes to explain the failure |

### Example: one click, business state, UI, and screenshot checks

Start on Android ApiDemo's **UI → Class names and subclasses** page in its initial state. Clicking `FIRST` should set the counter to 1, display `FIRST:1`, and match the reviewed appearance. Before running, open that initial page and prepare a reviewed post-click baseline at `baselines/first-clicked.jpg`, relative to the test file.

See [Android tests](./fixtures/android/ApiDemo/tests/) and [iOS tests](./fixtures/ios/ApiDemo/tests/) for complete scenarios and cleanup. Use `expect().toHaveWindowScreenShot(...)` for window comparison.

```javascript
const { describe, test, expect, run } = Test.create();
export { run };

describe('Counter button', () => {
  test('updates state, UI, and appearance', async () => {
    const button = R.id.api_ui_class_first;
    const clicked = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(button));
    expect(clicked.ok).toBe(true);

    // UI state
    await expect(button).toBeVisible();
    await expect(button).toSatisfy(view => String(view.getText()) === 'FIRST:1');

    // Screenshot
    await expect(button).toHaveElementScreenShot('baselines/first-clicked.jpg');

    // Native business state
    const count = await AndroidExp.runOnMainThread(() => Java.use(
      'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState'
    ).getInstance().getClickCount());
    expect(Number(count)).toBe(1);
  });
});
```

## Getting started

Prepare Node.js 20+.

Android requires ADB and an available device or emulator. iOS requires macOS, Xcode and its command-line tools; physical devices also require `iproxy` and development signing for the XCTest Runner used for input actions.

### 1. Install Skills

Run from the target app project root:

```bash
npx skills add agent-easy-use/mobile-easy-use --skill '*'
```

This selects all Skills in the repository. Follow the prompts to choose your agent and installation scope. See the [Skills CLI documentation](https://github.com/vercel-labs/skills#options) for the command and options.

**Install Skills and MCP separately**: Skills include Observable, Integrate, Probe, Test, Presets, and their supporting script generation and execution workflows. MCP provides tools to connect to the app and execute operations.

### 2. Integrate into the app

In the target app project, ask the agent to use the platform's Integrate Skill:

```text
Use to-android-integrate to integrate Mobile Easy Use into this app's debug variant.
```

```text
Use to-ios-integrate to integrate Mobile Easy Use into this app's internal debug configuration.
```

Integrate acquires and verifies Release artifacts, updates the project configuration, and returns an **exact compatible MCP launch command**. Android integrates an AAR that starts the Runtime automatically. iOS embeds the bridge and Runtime, which MCP loads when connecting. Scope integration to internal debug builds, then build and install the app on the target device.

Complete integration workflows: [Android Integrate Skill](./skills/to-android-integrate/SKILL.md) · [iOS Integrate Skill](./skills/to-ios-integrate/SKILL.md).

### 3. Install and configure MCP

Add `mobile-easy-use` to your agent's MCP configuration. **Use the compatible MCP version returned by the Integrate Skill in the previous step.** The version `0.1.0` below is only an example; replace it with the version in the MCP launch command returned by the Skill:

```json
{
  "mcpServers": {
    "mobile-easy-use": {
      "command": "npx",
      "args": ["-y", "@agent-easy-use/mobile-easy-use@0.1.0"]
    }
  }
}
```

`npx` fetches and starts the selected version without a separate global install. Use your client's configuration mechanism to set the working directory to the **target app project root** so MCP can resolve project Presets. The agent and MCP need shared local filesystem access to read SDK declarations, probes, and test files.

Reload the MCP configuration and check that tools such as `get_sdk_declarations` and `connect` are visible to the agent. New connections check compatibility between the app Runtime Release and MCP version and suggest an adjustment if they do not match.

### 4. Start a probe or test

After integration, build the app debug version containing the Mobile Easy Use Runtime and install it on the target device or simulator before using Probe. Connect the device, identify the target app, and describe your question:

```text
Use to-android-probe to investigate list refresh in com.example.app on the device.
Open the list page and refresh it. Check whether the request callback runs,
the data state updates, and the list displays the new content.
```

```text
Use to-ios-probe to investigate why tapping sign-in in com.example.app
does not open the home screen. Explain using relevant method calls,
business state, and UI evidence.
```

Probe uses source code and existing Presets to generate the investigation, connect to the app through MCP, execute actions, and collect relevant evidence. It answers the original question without requiring you to write probe scripts, distinguishing observed facts, source-based explanations, and unverified behavior.

Use separate Skills to generate and run tests:

```text
Use to-android-test-script to generate list-refresh tests that verify UI,
screenshots, and internal data state.
Use to-android-test to run this app's tests directory and summarize
passed, failed, and unrun cases.
```

For iOS, use `to-ios-test-script` and `to-ios-test`.

## Skills directory

Each platform has Skills for integration, exploration, testing, and reuse.

| Capability | When to use it | Android / iOS Skill |
| --- | --- | --- |
| **Observable** | Optional coding guidance with minimal intrusion: reuse or selectively add logs, UI identifiers, and runtime entry points so the app works better with Mobile Easy Use | [android-observable-code](./skills/android-observable-code/SKILL.md) / [ios-observable-code](./skills/ios-observable-code/SKILL.md) |
| **Integrate** | Set up or maintain debug integration, acquire Runtime artifacts, configure the project, and select a compatible MCP version; also prepare or repair iOS Runner signing | [to-android-integrate](./skills/to-android-integrate/SKILL.md) / [to-ios-integrate](./skills/to-ios-integrate/SKILL.md) |
| **Probe** | Start a runtime investigation in natural language, including probe generation, execution, and evidence analysis | [to-android-probe](./skills/to-android-probe/SKILL.md) / [to-ios-probe](./skills/to-ios-probe/SKILL.md) |
| **Test** | Generate test files from explicit expectations; run existing tests and summarize results | Generate: [Android](./skills/to-android-test-script/SKILL.md) / [iOS](./skills/to-ios-test-script/SKILL.md); run: [Android](./skills/to-android-test/SKILL.md) / [iOS](./skills/to-ios-test/SKILL.md) |
| **Presets** | Turn common navigation, business actions, and state queries into reusable capabilities with type declarations, bundled for probes and tests | [to-android-presets](./skills/to-android-presets/SKILL.md) / [to-ios-presets](./skills/to-ios-presets/SKILL.md) |

Probe composes the platform's `to-*-probe-script` and `to-*-run` Skills for generation and execution. For everyday use, start with Probe and describe your question.

### Observable: minimal changes for better integration (optional)

Observable is not a prerequisite for using Mobile Easy Use. It prioritizes existing logs, UI identifiers, and runtime entry points, making only small, local additions when the current development task calls for them. These changes preserve business behavior while making control lookup, call observation, and state verification easier.

Invoke Observable as needed. If you want it applied during everyday coding, you can add the following rules to the target project's `AGENTS.md` or agent coding rules after installing the Skills. Keep only your platform's line if appropriate:

```markdown
When writing or modifying Android App code, apply the android-observable-code skill.
When writing or modifying iOS App code, apply the ios-observable-code skill.
```

### Turn discoveries into Presets

```text
Use to-android-presets to create reusable capabilities for opening a list page,
refreshing its content, and reading its data state.
```

The target project's `.meu/config.json` sets the base directory through `presets.directory`, defaulting to `.meu/presets`, with separate `android/` and `ios/` subdirectories. Each capability contains `index.js` and `index.d.ts`. `presets.entry.js` exports the public capabilities; the build produces `presets.dist.js`. MCP loads the platform bundle when connecting.

Disconnect and reconnect after updates to load the new bundle. With a device available, the Skill executes the capabilities for verification. Without one, it can generate and build them but explicitly reports runtime behavior as unverified. See the Presets Skills above for directory and build details.

## Inspiration

Mobile Easy Use draws inspiration from **quickjs-android**, **xLua**, and **Frida**: embedding a scripting runtime in a host application, bridging scripts with native objects, and accessing app capabilities across runtime boundaries.

**Frida is the implementation foundation and an actual dependency.** The app-side Runtime is based on Frida Gadget. MCP uses `frida` to establish runtime connections and Java / Objective-C bridges to access platform objects. Mobile Easy Use builds on these capabilities with a mobile development SDK, MCP tools, evidence collection, and Skill workflows.

```text
Developer question → AI agent + Skills → MCP → Frida Runtime in the app
                                               ↕
                                  Methods / Objects / State / Logs / UI
```

See [package.json](./package.json) for package dependency versions. App-side binary versions and notices are documented in the [Android third-party notices](./integration/android/mobile-easy-use/THIRD_PARTY_NOTICES.md) and [iOS third-party notices](./integration/ios/THIRD_PARTY_NOTICES.md). The [compatibility catalog](./distribution/README.md) maintains Runtime Release / MCP compatibility.

## Local development

```bash
npm install
npm test
npm pack --dry-run
```

npm package: `@agent-easy-use/mobile-easy-use`.

## Feedback

Tried a probe or test? [Share your use case and where you got stuck](https://github.com/agent-easy-use/mobile-easy-use/issues). If Mobile Easy Use is useful for your work, star the repository to bookmark it.
