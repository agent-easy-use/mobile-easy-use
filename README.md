# Mobile Easy Use

**A tool for Android and iOS developers that brings live app runtime capabilities into AI coding—from understanding and implementation to debugging and verification.**

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

## What runtime information is available

Mobile Easy Use gives agents live app information to interpret alongside source code, understand behavior, diagnose problems, and verify changes:

| Runtime information | What it tells you |
| --- | --- |
| Method calls | Which methods an action triggers, their inputs and results, where calls originate, and which threads execute them |
| Method timing | How long relevant methods take, providing clues to slow calls and waits |
| Process memory | How process memory changes around method calls, providing clues for further memory investigations |
| Business logs | Which business events occur during an action, how far execution progresses, and what clues point to a failure |
| Business objects and state | Current data, configuration flags, counts, and business phases, including values that change after an action |
| UI and control state | Whether controls exist, whether they are visible, where they appear, and their currently readable properties |
| Window and element screenshots | The app's actual appearance, focused images of key elements, and visual changes before and after an action |
| App resources | Resource identifiers and contents associated with Android controls and configuration, connecting source code with the running app |
| Operation results and failure context | Whether an action completes, where it fails, and the state, logs, and images already collected |

These observations can be combined around the same action to understand how method execution and data changes lead to what appears on screen. Available information depends on the platform and app implementation.

## Not another UI automation testing solution

Mobile Easy Use can perform UI automation testing and participate throughout the mobile development coding process. It exposes app method calls, logs, business objects, state changes, and UI to agents, giving them runtime evidence alongside source code while understanding requirements, writing code, and verifying changes.

UI-focused automation testing primarily answers whether the interface and interactions behave as expected. Mobile Easy Use also answers how the app currently works, where to make a change, and whether implementation assumptions hold, bringing runtime information directly into development decisions.

| Capability | Traditional UI automation | Mobile Easy Use |
| --- | :---: | :---: |
| UI interactions: click, type, scroll, and more | ✓ | ✓ |
| UI state: locate controls, read properties, and wait for state | ✓ | ✓ |
| Capture screens and elements | ✓ | ✓ |
| Observe business objects and state | — | ✓ |
| Method observation: collect call chains, arguments, results, and stacks | — | ✓ |
| Measure execution time and process memory changes | — | ✓ |
| Temporarily change runtime conditions: override method returns or fields, then restore them | — | ✓ |
| Invoke internal app methods | — | ✓ |
| Correlate runtime results with source code | — | ✓ |

These capabilities span every stage of coding:

- **Before coding, understand the app and plan the change:** Explore target screens and business flows, inspect objects, configuration, and state, and observe actual call paths. Combine these observations with source code to decide where and how to implement the change.
- **During coding, check assumptions and adjust the implementation:** Hook the logic under development to inspect data and execution branches. When needed, temporarily override dependency returns or configuration fields to check behavior under different conditions. After editing and running a new build, continue observing to check implementation decisions as the work progresses.
- **After coding, verify behavior and preserve reusable capabilities:** Perform relevant interactions, compare business state and UI changes, confirm the intended outcome, and turn common actions and probes into reusable Presets.

For example, when developing a configuration-controlled page, an agent can first read its configuration and hook the page entry point to understand the existing path. During coding, it can temporarily replace the configuration getter's return value to establish enabled and disabled conditions, checking each branch's state and UI. After removing the overrides, it can verify the full interaction with real configuration in the new build. This provides both runtime understanding and active scenario control to check the implementation.

## Getting started

Prepare Node.js 20+.

Android requires ADB and an available device or emulator. iOS requires macOS, Xcode and its command-line tools; physical devices also require `iproxy` and development signing for the XCTest Runner used for input actions.

### 1. Install Skills

Run from the target app project root:

```bash
npx skills add agent-easy-use/mobile-easy-use --skill '*'
```

This selects all Skills in the repository. Follow the prompts to choose your agent and installation scope. See the [Skills CLI documentation](https://github.com/vercel-labs/skills#options) for the command and options.

**Install Skills and MCP separately**: Skills include Observable, Integrate, Probe, Presets, and their supporting script generation and execution workflows. MCP provides tools to connect to the app and execute operations.

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

`npx` fetches and starts the selected version without a separate global install. Use your client's configuration mechanism to set the working directory to the **target app project root** so MCP can resolve project Presets. The agent and MCP need shared local filesystem access to read SDK declarations and probe files.

Reload the MCP configuration and check that tools such as `get_sdk_declarations` and `connect` are visible to the agent. New connections check compatibility between the app Runtime Release and MCP version and suggest an adjustment if they do not match.

### 4. Explore with Probe

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

## Four Skill capabilities

These four capabilities cover coding, integration, everyday exploration, and reuse, with separate Android and iOS implementations.

| Capability | When to use it | Android / iOS Skill |
| --- | --- | --- |
| **Observable** | Optional coding guidance with minimal intrusion: reuse or selectively add logs, UI identifiers, and runtime entry points so the app works better with Mobile Easy Use | [android-observable-code](./skills/android-observable-code/SKILL.md) / [ios-observable-code](./skills/ios-observable-code/SKILL.md) |
| **Integrate** | Set up or maintain debug integration, acquire Runtime artifacts, configure the project, and select a compatible MCP version; also prepare or repair iOS Runner signing | [to-android-integrate](./skills/to-android-integrate/SKILL.md) / [to-ios-integrate](./skills/to-ios-integrate/SKILL.md) |
| **Probe** | Start a runtime investigation in natural language, including probe generation, execution, and evidence analysis | [to-android-probe](./skills/to-android-probe/SKILL.md) / [to-ios-probe](./skills/to-ios-probe/SKILL.md) |
| **Presets** | Turn common navigation, business actions, and state queries into reusable capabilities with type declarations, bundled for future probes | [to-android-presets](./skills/to-android-presets/SKILL.md) / [to-ios-presets](./skills/to-ios-presets/SKILL.md) |

Probe composes the platform's `to-*-script` and `to-*-run` Skills for generation and execution. For everyday use, start with Probe and describe your question.

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

The target project's `.meu/config.json` sets the base directory through `presets.directory`, defaulting to `.meu/presets`, with separate `android/` and `ios/` subdirectories. The Skill generates `probe.js`, `probe.d.ts`, and an export entry, then builds `presets.dist.js`. MCP loads the platform bundle when connecting.

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
