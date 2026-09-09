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

## 可以提供哪些运行时信息

Mobile Easy Use 让 Agent 获取 App 运行中的真实信息，结合源码理解行为、定位问题和验证改动：

| 运行时信息 | 可以了解什么 |
| --- | --- |
| 方法调用 | 一次操作触发了哪些方法、传入什么参数、返回什么结果，以及调用来自哪里、在哪个线程执行 |
| 方法耗时 | 相关方法执行了多久，为定位慢调用和等待提供线索 |
| 进程内存 | 方法调用前后进程内存如何变化，为进一步分析内存问题提供线索 |
| 业务日志 | 操作期间发生了哪些业务事件，执行到了哪个阶段，出现了什么异常线索 |
| 业务对象与状态 | 当前数据、配置开关、计数和业务阶段是什么，操作前后哪些值发生了变化 |
| 界面与控件状态 | 控件是否存在、是否可见、位于哪里，以及当前可读取的界面属性 |
| 页面与元素截图 | App 实际呈现的画面、关键元素的局部图像，以及操作前后的视觉变化 |
| App 资源 | Android App 中控件和配置对应的资源标识及内容，帮助关联源码与运行现场 |
| 操作结果与失败现场 | 操作是否完成、在哪一步失败，以及失败前已经获取的状态、日志和图像 |

这些信息可以围绕同一次操作组合起来，帮助 Agent 理解从方法执行、数据变化到界面呈现的过程。具体可获取的信息取决于平台和 App 的实现。

## 不是另一个 UI 自动化测试方案

Mobile Easy Use 可以做 UI 自动化测试，更面向移动端开发的完整 Coding 过程。它将 App 的方法调用、日志、业务对象、状态变化和 UI 开放给 Agent，让 Agent 在理解需求、编写代码和验证改动时，都能结合源码获取真实运行依据。

以 UI 为中心的自动化测试主要回答“界面和交互是否符合预期”。Mobile Easy Use 还可以回答“当前 App 是如何运行的”“应该修改哪里”“实现过程中的判断是否成立”，让运行时信息直接参与开发决策。

| 能力 | 传统 UI 自动化 | Mobile Easy Use |
| --- | :---: | :---: |
| UI 交互：点击、输入、滚动等 | ✓ | ✓ |
| UI 状态：控件查找、属性读取与状态等待 | ✓ | ✓ |
| 页面与元素截图 | ✓ | ✓ |
| 观察业务对象和状态 | — | ✓ |
| 方法观测：获取调用链、参数、返回值与调用栈 | — | ✓ |
| 获取执行耗时和内存变化 | — | ✓ |
| 临时改变运行条件：替换方法返回值或字段值 | — | ✓ |
| 主动调用 App 内部方法 | — | ✓ |

这些能力贯穿编码前、编码中和编码后：

- **编码前，理解现状与确定方案**：探索目标页面和业务流程，读取对象、配置与状态，观察实际调用路径，结合源码确定修改位置和实现方式。
- **编码中，检查判断与调整实现**：围绕正在开发的逻辑探查 App，通过 Hook 检查数据和执行分支，必要时临时调整依赖返回值或配置字段，验证不同条件下的处理逻辑；修改并运行新构建后继续观测，让实现过程中的判断及时得到验证。
- **编码后，验证行为与沉淀能力**：执行相关交互，对比业务状态与 UI 变化，确认改动是否符合预期，并将常用操作和探查沉淀为可复用的 Presets。

例如，开发一个受配置控制的页面时，Agent 可以先读取配置并 Hook 页面入口，确认现有执行路径；编码中临时替换配置读取方法的返回值，分别构造开启和关闭条件，检查各分支的状态与 UI；完成后恢复临时替换，在新构建中验证真实配置下的完整交互。这样既能了解运行现场，也能主动构造场景来检验实现。

## 使用方式

准备 Node.js 20+。

Android 需要 ADB 和可用设备或模拟器；iOS 需要 macOS、Xcode 及其命令行工具，真机连接还需要 `iproxy`，输入操作所用的 XCTest Runner 需要完成开发签名。

### 1. 安装 Skills

在目标 App 项目根目录执行：

```bash
npx skills add agent-easy-use/mobile-easy-use --skill '*'
```

该命令选择本仓库的全部 Skills，按提示选择所用 Agent 和安装范围即可。安装命令与参数说明见 [Skills CLI 文档](https://github.com/vercel-labs/skills#options)。

### 2. 集成到 App

在目标 App 工程中，让 Agent 使用对应的 Integrate Skill：

```text
使用 to-android-integrate，将 Mobile Easy Use 集成到这个 App 的 debug variant。
```

```text
使用 to-ios-integrate，将 Mobile Easy Use 集成到这个 App 的内部调试配置。
```

Integrate 会获取并校验 Release 产物，修改目标工程配置，并返回兼容的 **MCP 固定版本启动命令**。Android 通过 AAR 接入并自动启动 Runtime；iOS 嵌入桥接库和 Runtime，由 MCP 连接时加载。将集成限定在内部调试构建，随后构建并安装到目标设备。

### 3. 安装并配置 MCP

在 Agent 的 MCP 配置中添加 `mobile-easy-use`。**MCP 版本必须使用前一步 Integrate Skill 返回的兼容版本。** 以下配置中的 `0.1.0` 仅为示例，请根据 Skill 返回的 MCP 启动命令替换版本号：

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

### 4. 使用 Probe 探查

完成集成后，先编译并将包含 Mobile Easy Use Runtime 的 App 调试版本安装到目标设备或模拟器，再使用 Probe 探查。连接设备后，提供目标 App 和要调查的问题：

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
| **Observable** | 可选的编码辅助，以极低侵入性复用或按需补充日志、UI 标识与运行时入口，让 App 更好地配合 Mobile Easy Use | [android-observable-code](./skills/android-observable-code/SKILL.md) / [ios-observable-code](./skills/ios-observable-code/SKILL.md) |
| **Integrate** | 首次接入或维护调试集成，获取 Runtime 产物、配置工程，并确定兼容 MCP 版本；iOS 还包含 Runner 签名准备与修复 | [to-android-integrate](./skills/to-android-integrate/SKILL.md) / [to-ios-integrate](./skills/to-ios-integrate/SKILL.md) |
| **Probe** | 用自然语言发起一次运行时调查，完成探查生成、执行及证据分析 | [to-android-probe](./skills/to-android-probe/SKILL.md) / [to-ios-probe](./skills/to-ios-probe/SKILL.md) |
| **Presets** | 把常用页面导航、业务操作和状态读取沉淀为带类型声明的可复用能力，构建后供后续 Probe 使用 | [to-android-presets](./skills/to-android-presets/SKILL.md) / [to-ios-presets](./skills/to-ios-presets/SKILL.md) |

Probe 内部组合对应平台的 `to-*-script` 和 `to-*-run`，分别负责生成与执行；日常使用从 Probe 入口提出问题即可。

### Observable：以极低侵入性改善配合（可选）

Observable 不是使用 Mobile Easy Use 的强制前置条件。它优先复用现有日志、UI 标识和运行时入口，只在当前开发任务需要时做少量局部补充，保持业务行为不变，让控件定位、链路观测和状态验证更顺畅。

可按需调用 Observable Skill；如果希望在日常编码中持续使用，也可以在安装后将以下规则加入目标工程的 `AGENTS.md` 或 Agent 编码规则，单端项目只保留对应行：

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

## 灵感来源

Mobile Easy Use 的设计受到 **quickjs-android**、**xLua** 和 **Frida** 的启发：将脚本运行时嵌入宿主应用，桥接脚本与原生对象，让工具能够跨越运行时边界访问 App 内部能力。

**Frida 是本项目的实现基础和实际依赖。** App 侧 Runtime 基于 Frida Gadget；MCP 侧通过 `frida` 建立运行时连接，并使用 Java / Objective-C bridge 访问平台对象。Mobile Easy Use 在这些能力上提供面向移动开发的 SDK、MCP 工具、证据采集和 Skill 工作流。

```text
开发者的问题 → AI Agent + Skills → MCP → App 内的 Frida Runtime
                                           ↕
                                 方法 / 对象 / 状态 / 日志 / UI
```

依赖版本见 [package.json](./package.json)，App 侧二进制版本及第三方声明见 [Android 第三方声明](./integration/android/mobile-easy-use/THIRD_PARTY_NOTICES.md) 和 [iOS 第三方声明](./integration/ios/THIRD_PARTY_NOTICES.md)。Runtime Release 与 MCP 的兼容关系由[兼容目录](./distribution/README.md)维护。

## 本地开发

```bash
npm install
npm test
npm pack --dry-run
```

npm 包名：`@agent-easy-use/mobile-easy-use`。
