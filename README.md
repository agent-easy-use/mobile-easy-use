# Mobile Easy Use

**A tool for Android and iOS developers to explore live app behavior with AI agents.**

[中文文档](./README.zh.md)

Source code describes the implementation. The running app shows what actually happens. Mobile Easy Use exposes the mobile runtime through MCP so an AI agent can connect source code with method calls, business objects, state changes, logs, and UI to understand features, diagnose problems, and verify changes.

Ask the questions that come up during development:

```text
The data request succeeded. Why did the list not update?
Inspect the relevant method calls, data state, and UI changes.
```

```text
Verify this change to favorites. Do the business object and button state
agree before and after the action?
```

## What you can explore

| Information or action | Capability |
| --- | --- |
| Method calls and logs | Observe relevant Java / Objective-C calls and key-flow logs to identify the actual execution path |
| Business objects and state | Read runtime objects, fields, and resources; compare state before and after an action |
| Native UI | Locate controls, inspect view state, and capture window and element screenshots |
| Interactions and scenarios | Click, type, scroll, and wait for UI changes to reach the scenario under investigation |
| Task-specific probes | Generate and execute probes; temporarily override method returns or fields when needed to establish conditions |
| Results and failure context | Preserve outcomes, failure stages, and collected evidence, then interpret them alongside source code |

Android and iOS physical devices and simulators are supported. Current iOS method inspection uses the Objective-C runtime, and UI lookup uses UIKit. Pure Swift methods and SwiftUI elements without corresponding UIViews are outside the direct coverage of these interfaces.

## More than UI automation testing

Mobile Easy Use supports UI automation testing and lets agents explore live app state before and during coding. Mobile development requires understanding the data, objects, and execution paths behind a screen. This information helps an agent decide where to make a change, how to implement it, and whether it behaves as intended.

| Dimension | UI-focused automation testing | Mobile Easy Use |
| --- | --- | --- |
| Primary goal | Run test cases and check expected UI and interactions | Understand runtime behavior, guide coding, diagnose problems, and verify results |
| Observation scope | Controls, interactions, screenshots, and UI state | UI plus method calls, logs, business objects, and state changes |
| Task entry point | Write or generate test cases around expected behavior | Generate and execute a probe around the current development question |
| Contribution to coding | Reveal behavioral differences through test results | Correlate source code with runtime evidence to guide where and how to change code |
| Reusable capabilities | Test cases, page objects, and helpers | Page actions, business probes, and state queries through Presets |

### Why it fits a coding environment

An agent needs access to real app behavior throughout development. Mobile Easy Use brings runtime exploration into that process, allowing source analysis, live observations, and code changes to inform one another:

- **Before coding, understand the current behavior:** Explore the target screen and business flow, inspect objects, configuration, and state, and observe actual call paths to inform the implementation plan.
- **During coding, check assumptions:** Probe the logic being changed to determine whether data arrives, where state changes, and which branch executes, then use those observations to locate problems and adjust the implementation.
- **After a change, verify the result:** Perform relevant interactions, compare business state and UI changes, confirm the outcome, and turn common actions into Presets.

For example, when investigating a successful data request that leaves the list unchanged, an agent can inspect the request callback, result object, and list state before choosing where to edit the source. After changing the code and running the new build, it can inspect the same flow's state and UI changes again. Exploration spans understanding the problem, coding, and verification.

## Getting started

Prepare Node.js 20+ and install the relevant platform Skills from [skills](./skills) through your agent's Skill / Plugin installation flow. Preserve the sibling Skills, scripts, and references they use. **Install MCP and Skills separately**: MCP provides connection and execution tools; Skills guide the agent through development tasks using those tools.

Android requires ADB and an available device or emulator. iOS requires macOS, Xcode and its command-line tools; physical devices also require `iproxy` and development signing for the XCTest Runner used for input actions.

### 1. Integrate into the app

In the target app project, ask the agent to use the platform's Integrate Skill:

```text
Use to-android-integrate to integrate Mobile Easy Use into this app's debug variant.
```

```text
Use to-ios-integrate to integrate Mobile Easy Use into this app's internal debug configuration.
```

Integrate acquires and verifies Release artifacts, updates the project configuration, and returns an **exact compatible MCP launch command**. Android integrates an AAR that starts the Runtime automatically. iOS embeds the bridge and Runtime, which MCP loads when connecting. Scope integration to internal debug builds, then build and install the app on the target device.

Detailed integration instructions: [Android](./integration/android/README.md) · [iOS](./integration/ios/README.md).

### 2. Install and configure MCP

Add `mobile-easy-use` to your agent's MCP configuration using the version returned by Integrate. This is a generic stdio configuration example; replace the example version `0.1.0` with the compatible version from your integration result:

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

`npx` fetches and starts the selected version without a separate global install. Use your client's configuration mechanism to set the working directory to the **target app project root** so MCP can resolve project Presets. The agent and MCP need shared local filesystem access to read SDK declarations and probe files.

Reload the MCP configuration and check that tools such as `get_sdk_declarations` and `connect` are visible to the agent. New connections check compatibility between the app Runtime Release and MCP version and suggest an adjustment if they do not match.

### 3. Explore with Probe

Connect a device, identify the target app, and describe your question:

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

## Four Skill capabilities

These four capabilities cover coding, integration, everyday exploration, and reuse, with separate Android and iOS implementations.

| Capability | When to use it | Android / iOS Skill |
| --- | --- | --- |
| **Observable** | While changing app code, preserve or add useful logs, stable UI identifiers, and necessary runtime entry points to make later inspection easier | [android-observable-code](./skills/android-observable-code/SKILL.md) / [ios-observable-code](./skills/ios-observable-code/SKILL.md) |
| **Integrate** | Set up or maintain debug integration, acquire Runtime artifacts, configure the project, and select a compatible MCP version; also prepare or repair iOS Runner signing | [to-android-integrate](./skills/to-android-integrate/SKILL.md) / [to-ios-integrate](./skills/to-ios-integrate/SKILL.md) |
| **Probe** | Start a runtime investigation in natural language, including probe generation, execution, and evidence analysis | [to-android-probe](./skills/to-android-probe/SKILL.md) / [to-ios-probe](./skills/to-ios-probe/SKILL.md) |
| **Presets** | Turn common navigation, business actions, and state queries into reusable capabilities with type declarations, bundled for future probes | [to-android-presets](./skills/to-android-presets/SKILL.md) / [to-ios-presets](./skills/to-ios-presets/SKILL.md) |

Probe composes the platform's `to-*-script` and `to-*-run` Skills for generation and execution. For everyday use, start with Probe and describe your question.

### Make new code observable

After installing the Observable Skills, add the relevant rules to the target project's `AGENTS.md` or agent coding rules. Keep only your platform's line if appropriate:

```markdown
When writing or modifying Android App code, apply the android-observable-code skill.
When writing or modifying iOS App code, apply the ios-observable-code skill.
```

### Turn discoveries into Presets

```text
Use to-android-presets to create reusable capabilities for opening a list page,
refreshing its content, and reading its data state.
```

The target project's `.meu/config.json` sets the base directory through `presets.directory`, defaulting to `.meu/presets`, with separate `android/` and `ios/` subdirectories. The Skill generates `probe.js`, `probe.d.ts`, and an export entry, then builds `presets.dist.js`. MCP loads the platform bundle when connecting.

Disconnect and reconnect after updates to load the new bundle. With a device available, the Skill executes the capabilities for verification. Without one, it can generate and build them but explicitly reports runtime behavior as unverified. See the Presets Skills above for directory and build details.

## Inspiration and Frida dependency

Mobile Easy Use draws inspiration from **quickjs-android**, **xLua**, and **Frida**: embedding a scripting runtime in a host application, bridging scripts with native objects, and accessing app capabilities across runtime boundaries.

**Frida is the implementation foundation and an actual dependency.** The app-side Runtime is based on Frida Gadget. MCP uses `frida` to establish runtime connections and Java / Objective-C bridges to access platform objects. Mobile Easy Use builds on these capabilities with a mobile development SDK, MCP tools, evidence collection, and Skill workflows.

```text
Developer question → AI agent + Skills → MCP → Frida Runtime in the app
                                               ↕
                                  Methods / Objects / State / Logs / UI
```

See [package.json](./package.json) for package dependency versions. App-side binary versions and notices are documented in the [Android integration guide](./integration/android/README.md#embedded-native-runtime), [iOS integration guide](./integration/ios/README.md#embedded-native-runtime), [Android third-party notices](./integration/android/mobile-easy-use/THIRD_PARTY_NOTICES.md), and [iOS third-party notices](./integration/ios/THIRD_PARTY_NOTICES.md). The [compatibility catalog](./distribution/README.md) maintains Runtime Release / MCP compatibility.

## Local development

```bash
npm install
npm test
npm pack --dry-run
```

npm package: `@agent-easy-use/mobile-easy-use`.
