# Mobile Easy Use

**面向 Android / iOS 开发者，让 AI Agent 探查 App 真实运行信息的工具。**

[English](./README.md)

源码告诉你 App 如何实现，运行现场告诉你它实际发生了什么。Mobile Easy Use 通过 MCP 将移动 App 的运行时开放给 AI Agent，让它结合源码探查方法调用、业务对象、状态变化、日志和 UI，帮助开发者理解业务、定位问题和验证改动。

你可以直接提出开发中的问题：

```text
数据请求成功了，为什么列表没有更新？检查相关方法调用、数据状态和页面变化。
```

```text
检查收藏功能的这次改动，操作前后的业务对象和按钮状态是否一致？
```

## 可以探查什么

| 信息或操作 | 能力 |
| --- | --- |
| 方法调用与日志 | 观察相关 Java / Objective-C 方法调用和关键链路日志，确认实际执行路径 |
| 业务对象与状态 | 读取运行时对象、字段和资源，对比操作前后的业务状态 |
| 原生 UI | 查找控件、查看视图状态，获取窗口截图和元素截图 |
| 交互与场景 | 点击、输入、滚动、等待 UI 变化，进入需要分析的场景 |
| 临时探查 | 按问题生成并执行 Probe，必要时临时调整方法返回值或字段来构造条件 |
| 结果与失败现场 | 保留执行结果、失败阶段及已采集的证据，结合源码解释原因 |

支持 Android 和 iOS 的真机与模拟器。当前 iOS 方法探查基于 Objective-C 运行时，UI 查找基于 UIKit；纯 Swift 方法和没有对应 UIView 的 SwiftUI 元素不在这些接口的直接覆盖范围内。

## 不仅仅是用来做 UI 自动化测试

Mobile Easy Use 支持 UI 自动化测试，也让 Agent 在编码前和编码过程中探查 App 的真实运行状态。移动端开发需要理解页面背后的数据、对象和执行路径；这些信息可以直接帮助 Agent 判断应该改哪里、如何实现，以及改动是否符合预期。

| 维度 | 以 UI 为中心的自动化测试 | Mobile Easy Use |
| --- | --- | --- |
| 主要目标 | 执行用例，检查界面和交互是否符合预期 | 理解 App 运行行为，辅助编码、定位问题并验证结果 |
| 观察范围 | 控件、交互、截图和界面状态 | UI，以及方法调用、日志、业务对象和状态变化 |
| 任务入口 | 围绕预期行为编写或生成测试用例 | 围绕当前开发问题生成并执行 Probe |
| 对编码的帮助 | 通过测试结果发现行为偏差 | 结合源码与运行时证据，帮助确定修改位置和实现方式 |
| 可复用能力 | 测试用例、页面对象和辅助函数 | 页面操作、业务探查和状态读取 Presets |

### 为什么适合 Coding 环境

Agent 在编码时需要持续获取 App 的真实信息。Mobile Easy Use 将运行时探查带入开发过程，让源码分析、实际观测和代码修改相互验证：

- **编码前理解现状**：探索目标页面和业务流程，读取当前对象、配置与状态，观察实际调用路径，为实现方案提供依据。
- **编码中检查判断**：针对正在修改的逻辑随时发起探查，检查数据是否到达、状态在哪一步变化、代码实际进入哪个分支，帮助定位问题和调整实现。
- **改动后验证结果**：执行相关交互，对比业务状态与 UI 变化，确认改动是否生效，并将常用操作沉淀为 Presets。

例如，处理“数据请求成功但列表未更新”时，Agent 可以先探查请求回调、结果对象和列表状态，结合源码确定修改位置；修改并运行新构建后，再检查同一条链路的状态与界面变化。探查贯穿问题理解、编码和验证全过程。

## 使用方式

准备 Node.js 20+，并通过所用 Agent 的 Skill / Plugin 安装流程安装本仓库 [skills](./skills) 中对应平台的 Skill，保留其引用的兄弟 Skill、脚本和参考文件。**MCP npm 包与 Skills 分开安装**：MCP 提供连接与执行工具，Skills 指导 Agent 如何使用这些工具完成开发任务。

Android 需要 ADB 和可用设备或模拟器；iOS 需要 macOS、Xcode 及其命令行工具，真机连接还需要 `iproxy`，输入操作所用的 XCTest Runner 需要完成开发签名。

### 1. 先集成到 App

在目标 App 工程中，让 Agent 使用对应的 Integrate Skill：

```text
使用 to-android-integrate，将 Mobile Easy Use 集成到这个 App 的 debug variant。
```

```text
使用 to-ios-integrate，将 Mobile Easy Use 集成到这个 App 的内部调试配置。
```

Integrate 会获取并校验 Release 产物，修改目标工程配置，并返回兼容的 **MCP 固定版本启动命令**。Android 通过 AAR 接入并自动启动 Runtime；iOS 嵌入桥接库和 Runtime，由 MCP 连接时加载。将集成限定在内部调试构建，随后构建并安装到目标设备。

详细接入说明：[Android](./integration/android/README.md) · [iOS](./integration/ios/README.md)。

### 2. 安装并配置 MCP

在 Agent 的 MCP 配置中添加 `mobile-easy-use`，使用 Integrate 返回的版本。以下是通用 stdio 配置示例，`0.1.0` 仅作示例，应替换为集成结果中的兼容版本：

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

`npx` 会获取并启动指定版本，无需先全局安装。按所用客户端的配置方式设置工作目录为**目标 App 项目根目录**，以便读取项目 Presets；Agent 与 MCP 需要共享本地文件系统，用于读取 SDK 声明和探查文件。

重新加载 MCP 配置后，确认 Agent 能看到 `get_sdk_declarations`、`connect` 等工具。新建连接时，MCP 会检查 App Runtime Release 与 MCP 版本的兼容性；不匹配时会给出调整建议。

### 3. 使用 Probe 探查

连接设备后，提供目标 App 和要调查的问题：

```text
使用 to-android-probe，探查设备上 com.example.app 的列表刷新流程：
进入列表页并刷新，检查请求回调是否触发、数据状态是否更新、列表是否显示新内容。
```

```text
使用 to-ios-probe，检查 com.example.app 点击登录后为什么没有进入首页。
结合相关方法调用、业务状态和 UI 证据解释原因。
```

Probe 会结合源码和已有 Presets 生成探查逻辑，通过 MCP 连接 App、执行操作并收集相关证据，最后回答原始问题。你不需要手写探查脚本；结果会区分真实观测、源码推断和仍未验证的部分。

## 四类 Skill 能力

四类能力覆盖编码、接入、日常探查和复用；Android 与 iOS 各有对应实现。

| 能力 | 何时使用 | Android / iOS Skill |
| --- | --- | --- |
| **Observable** | 编写或修改 App 代码时，复用或补充关键日志、稳定 UI 标识，以及必要的运行时入口，让后续探查更容易 | [android-observable-code](./skills/android-observable-code/SKILL.md) / [ios-observable-code](./skills/ios-observable-code/SKILL.md) |
| **Integrate** | 首次接入或维护调试集成，获取 Runtime 产物、配置工程，并确定兼容 MCP 版本；iOS 还包含 Runner 签名准备与修复 | [to-android-integrate](./skills/to-android-integrate/SKILL.md) / [to-ios-integrate](./skills/to-ios-integrate/SKILL.md) |
| **Probe** | 用自然语言发起一次运行时调查，完成探查生成、执行及证据分析 | [to-android-probe](./skills/to-android-probe/SKILL.md) / [to-ios-probe](./skills/to-ios-probe/SKILL.md) |
| **Presets** | 把常用页面导航、业务操作和状态读取沉淀为带类型声明的可复用能力，构建后供后续 Probe 使用 | [to-android-presets](./skills/to-android-presets/SKILL.md) / [to-ios-presets](./skills/to-ios-presets/SKILL.md) |

Probe 内部组合对应平台的 `to-*-script` 和 `to-*-run`，分别负责生成与执行；日常使用从 Probe 入口提出问题即可。

### 让新增代码便于观测

安装 Observable Skill 后，可将对应规则加入目标工程的 `AGENTS.md` 或 Agent 编码规则，单端项目只保留对应行：

```markdown
When writing or modifying Android App code, apply the android-observable-code skill.
When writing or modifying iOS App code, apply the ios-observable-code skill.
```

### 将探查沉淀为 Presets

```text
使用 to-android-presets，把进入列表页、刷新内容和读取数据状态沉淀为可复用能力。
```

Presets 的基础目录由目标项目 `.meu/config.json` 中的 `presets.directory` 配置，默认 `.meu/presets`，下面按 `android/` 和 `ios/` 分开维护。Skill 生成 `probe.js`、`probe.d.ts` 和导出入口，并构建 `presets.dist.js`；MCP 在连接时加载对应平台的产物。

更新后需要断开并重新连接才能加载新产物。有设备时会执行验证；没有设备时可以完成生成和构建，但会明确注明运行效果尚未验证。具体目录与构建约定见上表的 Presets Skill。

## 灵感来源与 Frida 依赖

Mobile Easy Use 的设计受到 **quickjs-android**、**xLua** 和 **Frida** 的启发：将脚本运行时嵌入宿主应用，桥接脚本与原生对象，让工具能够跨越运行时边界访问 App 内部能力。

**Frida 是本项目的实现基础和实际依赖。** App 侧 Runtime 基于 Frida Gadget；MCP 侧通过 `frida` 建立运行时连接，并使用 Java / Objective-C bridge 访问平台对象。Mobile Easy Use 在这些能力上提供面向移动开发的 SDK、MCP 工具、证据采集和 Skill 工作流。

```text
开发者的问题 → AI Agent + Skills → MCP → App 内的 Frida Runtime
                                           ↕
                                 方法 / 对象 / 状态 / 日志 / UI
```

依赖版本见 [package.json](./package.json)，App 侧二进制版本及第三方声明见 [Android 集成说明](./integration/android/README.md#embedded-native-runtime)、[iOS 集成说明](./integration/ios/README.md#embedded-native-runtime)、[Android 第三方声明](./integration/android/mobile-easy-use/THIRD_PARTY_NOTICES.md) 和 [iOS 第三方声明](./integration/ios/THIRD_PARTY_NOTICES.md)。Runtime Release 与 MCP 的兼容关系由[兼容目录](./distribution/README.md)维护。

## 本地开发

```bash
npm install
npm test
npm pack --dry-run
```

npm 包名：`@agent-easy-use/mobile-easy-use`。
