# Mobile Easy Use

**Give AI agents the visibility they need to understand, operate, and verify mobile apps.**

[中文文档](./README.zh.md)

> The more an agent can observe through its tools, the more accurately it can work.

An agent is only as accurate as the evidence available to it. Source code explains what an application is intended to do, but it does not reveal everything the application actually does at runtime.

This visibility gap is especially large in mobile development. The app runs inside a physical device or simulator, across sandboxed processes and platform-native UI systems. Important clues are scattered across device logs, runtime objects, method calls, view hierarchies, screenshots, and state transitions. Generic coding tools can read the repository, but they struggle to acquire and correlate this live information. As a result, an agent may understand the implementation while still being unable to see what really happened on the device.

That is why we built Mobile Easy Use. It exposes the live Android and iOS app runtime—including call chains, business state, UI state, screenshots, and controlled interactions—so agents can work from observable evidence instead of source-code assumptions alone.

Mobile Easy Use is designed to be the ultimate tool for agent-driven mobile development: the bridge from reading code to observing the app, operating it, and verifying the result.

## What agents can observe

With Mobile Easy Use, an agent can inspect an Android or iOS app in its real runtime environment:

- **Runtime call chains** — Observe relevant Java or Objective-C method calls alongside application logs to understand which code paths an action actually triggered.
- **Business state transitions** — Compare values, objects, caches, and application state before and after an operation.
- **Native UI state** — Locate native controls in the active window and inspect the interface as the app is running.
- **Window and element screenshots** — Capture the full app window and focused element crops as reviewable visual evidence.
- **Runtime objects and resources** — Access Android resources, Java objects, Objective-C objects, and native runtime capabilities.
- **Failure context** — Preserve operation results, failure stages, and evidence already collected, allowing the agent to distinguish observation from inference.

Mobile Easy Use also gives agents controlled ways to act:

- Click, enter text, scroll, and wait for UI state
- Navigate to a target scenario and verify the outcome
- Generate and run task-specific runtime probes
- Establish temporary test conditions and restore them afterward
- Turn verified workflows into reusable presets

## What you can do with it

### Diagnose issues with real evidence

Let the agent correlate source code with live runtime behavior and answer questions such as:

- Why did tapping this button fail to navigate?
- The request succeeded—why did the screen not update?
- At which step did this business state change?
- Why did the runtime take a different branch from the one suggested by the source?
- Is the problem in user interaction, business logic, state management, or rendering?

### Verify changes with confidence

After changing code, the agent can enter the target screen, perform the relevant action, and collect call-chain, state, and UI evidence. Verification becomes a reviewable account of what happened—not merely “the test passed” or “the screen looks correct.”

### Explore unfamiliar applications

When documentation is incomplete or the codebase is complex, the agent can combine source inspection with runtime exploration to discover important screens, entry points, resources, objects, and business flows.

### Convert one-time discoveries into durable capabilities

Verified navigation, actions, and probes can be promoted into reusable presets. Future agents can repeat the workflow without rediscovering the same implementation details.

## More than UI automation

Traditional UI automation mainly records what was tapped and what appeared on screen. Mobile Easy Use connects the interface to business state and runtime execution.

| Capability | Traditional UI automation | Mobile Easy Use |
| --- | :---: | :---: |
| Operate the app | ✓ | ✓ |
| Capture screens and elements | ✓ | ✓ |
| Observe business objects and state | — | ✓ |
| Observe relevant method call chains | — | ✓ |
| Correlate runtime results with source code | — | ✓ |
| Generate task-specific probes for an agent | — | ✓ |
| Build reusable business presets | Limited | ✓ |

Mobile Easy Use is not another record-and-replay framework. It is the runtime interface between an AI agent and a mobile application.

## Platform capabilities

| Capability | Android | iOS |
| --- | :---: | :---: |
| Physical devices and simulators | ✓ | ✓ |
| Native UI lookup | ✓ | ✓ |
| Click, text input, and scroll | ✓ | ✓ |
| UI state waiting | ✓ | ✓ |
| Window and element screenshots | ✓ | ✓ |
| Before-and-after state evidence | ✓ | ✓ |
| Business method evidence | Java | Objective-C |
| Native log evidence | Log | NSLog |
| Temporary return-value overrides | ✓ | ✓ |
| Custom runtime probes | ✓ | ✓ |

## How it works for users

Mobile Easy Use provides an MCP server that connects agents to devices and apps, executes runtime operations, and returns evidence. Once connected, describe the outcome you need in natural language:

```text
Find out why tapping the sign-in button does not open the home screen.
Show me call-chain, state, and UI evidence.
```

```text
Open the product detail screen and verify that favoriting the item updates
both the business object and the visible interface.
```

```text
Explore this app's search flow and turn the verified actions into a reusable preset.
```

The agent selects the appropriate Android or iOS workflow, creates the smallest useful probe, performs controlled operations, and answers with evidence from the running app.

## Quick start

### Requirements

- Node.js 20 or later
- Android: ADB and an available physical device or emulator
- iOS: macOS, Xcode Command Line Tools, and an available physical device or simulator
- `iproxy` for an iOS physical-device connection

Before runtime exploration, integrate Mobile Easy Use Runtime into a debug build of the target app.

The integration workflow reports the exact compatible MCP version. Run that pinned version directly:

```bash
npx -y @agent-easy-use/mobile-easy-use@0.1.0
```

On a new connection, Mobile Easy Use checks the App runtime's Release against the live compatibility catalog and gives a concrete upgrade or downgrade action when versions do not match.

Agent-specific plugins and installation instructions are maintained separately from this runtime repository.

## Inspiration

Mobile Easy Use draws inspiration from the interoperability mechanisms explored by projects such as **quickjs-android**, **xLua**, and **Frida**—especially their approaches to embedding scripting environments, bridging JavaScript or Lua with native objects, and invoking platform capabilities across runtime boundaries.

- **quickjs-android** demonstrates how a lightweight JavaScript runtime can be embedded in Android and connected to native platform capabilities.
- **xLua** offers valuable ideas for efficient interoperability between a scripting language and a host application runtime.
- **Frida** provides the dynamic instrumentation and cross-platform runtime access required to inspect and interact with live Android and iOS applications.

After evaluating these approaches, Mobile Easy Use ultimately chose **Frida as its implementation foundation**. It extends Frida's runtime capabilities into a tool designed specifically for AI agents, combining runtime access, controlled interaction, evidence collection, and reusable mobile-development workflows.

## Development and publishing

Install dependencies and run the test suite:

```bash
npm install
npm test
```

Inspect the npm package before publishing:

```bash
npm pack --dry-run
```

Publish the package:

```bash
npm publish --access public
```

The npm package is published as `@agent-easy-use/mobile-easy-use`.

---

**Give agents more real-world information—and make every diagnosis, change, and verification evidence-driven.**
