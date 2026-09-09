# Mobile Easy Use

**让 AI Agent 真正看见、理解并操作移动 App。**

[English](./README.md)

> Tool 能观测到的信息越多，Agent 工作得越准确。

Agent 的准确度取决于它能够获得多少真实证据。源码描述了 App 应该如何工作，却无法完整呈现 App 在运行时究竟发生了什么。

在移动端开发中，这种信息差尤其明显。App 运行在真机或模拟器中，受到进程沙箱和平台原生 UI 系统的隔离；关键线索分散在设备日志、运行时对象、方法调用、视图层级、页面截图和状态变化之中。通用编码工具能够阅读仓库，却很难主动获取并关联这些实时信息。因此，Agent 即使读懂了实现，也可能依然看不见设备上真正发生的事情。

这正是我们开发 Mobile Easy Use 的原因。它把 Android 和 iOS App 内部的运行时、调用链、业务状态、UI 状态、截图和受控交互能力交给 Agent，让 Agent 不再只靠源码猜测，而是基于真实运行证据完成分析、验证和自动化。

我们希望把 Mobile Easy Use 打造成面向 Agent 的移动端开发终极 Tool：连接源码与真实运行现场，让 Agent 从“阅读代码”走向“观察 App、操作 App、验证结果”。

## Agent 可以看见什么

借助 Mobile Easy Use，Agent 可以在 Android 和 iOS App 的真实运行环境中观测：

- **运行时调用链**：观察相关 Java 方法、Objective-C 方法及业务日志，理解一次操作实际触发了哪些代码路径。
- **业务状态变化**：对比操作前后的值、对象、缓存和应用状态，判断逻辑是否真正生效。
- **原生 UI 状态**：在当前窗口中查找原生控件，观察 App 正在呈现的真实界面。
- **窗口与元素截图**：获取完整 App 窗口及关键元素截图，让视觉结果成为可审查的证据。
- **运行时对象与资源**：访问 Android 资源、Java 对象、Objective-C 对象和原生运行时能力。
- **异常与失败现场**：保留操作结果、失败阶段和已经收集的证据，帮助 Agent 区分观察事实与源码推断。

Mobile Easy Use 不只提供“看见”的能力，也让 Agent 能够进行受控操作：

- 点击、输入、滚动和等待 UI 状态
- 导航到目标场景并验证最终结果
- 按任务动态生成并执行运行时探测脚本
- 临时构造测试条件，并在操作结束后恢复
- 将验证过的工作流沉淀为可复用 Preset

## 它能帮助你做什么

### 用真实证据定位问题

让 Agent 同时检查源码和真实运行现场，回答：

- 点击按钮后为什么没有跳转？
- 请求已经成功，为什么页面没有更新？
- 某个业务状态在哪一步发生了变化？
- 为什么运行时走了与源码预期不同的分支？
- 问题来自交互、业务逻辑、状态管理，还是 UI 渲染？

### 更可信地验证改动

修改代码后，Agent 可以进入目标页面、执行相关操作，并收集调用链、状态和 UI 证据。验证结果不再只是“测试通过”或“看起来没问题”，而是一份可以复查的真实运行记录。

### 更高效地探索陌生 App

面对文档缺失、架构复杂或历史包袱较重的工程，Agent 可以结合源码与运行时逐步建立认知，发现关键页面、入口、资源、对象和业务路径。

### 把一次发现变成长期能力

经过验证的页面导航、业务操作和状态探测可以沉淀为 Preset。后续 Agent 无需重新探索，即可稳定复用同一套能力。

### Presets 目录与构建

Android、iOS 分别使用 `to-android-presets`、`to-ios-presets`。Skill 按用户诉求沉淀探查代码和声明；有设备时连接并真实执行验证，无设备时注明未实机验证。
目录只根据 `.meu/config.json` 中的基础目录解析；初始化时写入用户指定目录，未指定则写入默认值：

```json
{ "presets": { "directory": ".meu/presets" } }
```

相对路径以目标项目根目录为基准；MCP 必须从该项目根目录启动。平台后缀自动添加：

```text
.meu/presets/
├── android/
│   ├── page-state/probe.js
│   ├── page-state/probe.d.ts
│   ├── presets.entry.js
│   └── presets.dist.js
└── ios/                       # 相同结构，独立实现
```

`presets.entry.js` 定义公开导出，各功能的 `probe.d.ts` 描述接口。to-script 查阅入口和对应功能声明，优先复用已有能力。
connect 根据平台加载 `presets.dist.js`，运行时统一通过 `/meu/presets.js` 导入。
无论是否配置基础目录，对应平台的产物不存在就跳过；已有产物为空、读取失败或加载失败时明确报错。

在目标项目根目录执行对应 skill 的构建脚本：

```bash
node <skill目录>/scripts/build-presets.mjs
```

配置、源码目录及入口和声明文件由 skill 维护。用户指定新目录且旧配置目录下已有任一平台的 `presets.dist.js` 时，skill 提示旧能力将不再从新目录加载，得到明确确认后才更新配置并继续生成、打包；旧文件保留。
每个平台的 skill 自带独立构建脚本。脚本只读取配置或默认路径，从已有入口生成 `presets.dist.js`，不修改配置或初始化文件。
脚本通过 npm 缓存调用固定版本的 esbuild-wasm，
将 JavaScript 模块打包为单文件 ESM；首次需要 npm 源可访问，无需手动安装或修改 App 的依赖。

临时 `probe.js` 直接通过 `call_function` 执行。
产物原子替换，构建失败保留旧文件；构建成功不能替代设备验证。
有设备时，更新 presets 后断开并重新 connect，再执行变更的公开接口验收；无设备时仍可完成生成和打包，但必须说明真实运行效果尚不确定，并建议连接真机验证。单纯 connect 会复用健康连接及旧 bundle。

## 不只是 UI 自动化

传统 UI 自动化主要记录“点了什么”和“页面长什么样”。Mobile Easy Use 同时连接 UI、业务状态和运行时执行过程。

| 能力 | 传统 UI 自动化 | Mobile Easy Use |
| --- | :---: | :---: |
| 操作 App | ✓ | ✓ |
| 页面与元素截图 | ✓ | ✓ |
| 观察业务对象和状态 | — | ✓ |
| 观察相关方法调用链 | — | ✓ |
| 关联源码解释运行结果 | — | ✓ |
| 为 Agent 动态生成探测能力 | — | ✓ |
| 沉淀可复用业务 Preset | 有限 | ✓ |

Mobile Easy Use 不是另一套录制回放框架，而是 AI Agent 与移动 App 运行时之间的桥梁。

## 平台能力

| 能力 | Android | iOS |
| --- | :---: | :---: |
| 真机与模拟器 | ✓ | ✓ |
| 原生 UI 查找 | ✓ | ✓ |
| 点击、输入和滚动 | ✓ | ✓ |
| UI 状态等待 | ✓ | ✓ |
| 窗口与元素截图 | ✓ | ✓ |
| 操作前后状态证据 | ✓ | ✓ |
| 业务方法调用证据 | Java | Objective-C |
| 原生日志证据 | Log | NSLog |
| 临时返回值替换 | ✓ | ✓ |
| 自定义运行时探测 | ✓ | ✓ |

## 用户如何使用

Mobile Easy Use 提供 MCP 服务，连接 Agent 与设备和 App、执行运行时操作并返回证据。连接后，只需要用自然语言描述目标：

```text
检查登录按钮点击后为什么没有进入首页，并给出调用链、状态和 UI 证据。
```

```text
进入商品详情页，验证收藏操作是否同时更新了业务对象和可见界面。
```

```text
探索这个 App 的搜索流程，并把验证过的操作沉淀成可复用 Preset。
```

Agent 会根据任务选择 Android 或 iOS 工作流，生成最小且必要的探测代码，执行受控操作，并用真实运行证据回答原始问题。

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- Android：ADB 与可用的真机或模拟器
- iOS：macOS、Xcode Command Line Tools 与可用的真机或模拟器
- iOS 物理设备连接需要 `iproxy`

开始运行时探索前，需要将 Mobile Easy Use Runtime 接入目标 App 的调试构建。

集成流程会返回明确的兼容 MCP 版本。请直接运行这个固定版本：

```bash
npx -y @agent-easy-use/mobile-easy-use@0.1.0
```

每次新建连接时，Mobile Easy Use 会用实时兼容目录校验 App Runtime 的 Release；版本不匹配时，会给出明确的升级或降级建议。

面向不同 Agent 的 Plugin 及其安装说明将在独立仓库中维护。

生成或修改 probe 前，`to-android-script` 和 `to-ios-script` 会调用
`get_sdk_declarations` MCP 工具，传入 `platform: "android"` 或 `platform: "ios"`。
工具返回 `{ platform, sdkVersion, files }`，每个文件包含 `source`（`sdk`、`bridge` 或
`gum`）、一句话 `description`、`packageName`、`packageVersion` 和本地绝对 `path`。Agent 自行搜索并读取任务
涉及的声明及关联类型，MCP 不传输声明正文。Agent 和 MCP 需要共享文件系统访问权限，
无需连接设备或进行本地编译。Frida Gum 声明作为 npm 生产依赖安装，项目自身的
presets 入口和各功能的 `probe.d.ts` 仍从本地读取。

### 编码指导（可选）

通过所用 Agent 的 Skill/Plugin 安装流程安装 `android-observable-code` 和 `ios-observable-code` 后，在目标 App 项目的 `AGENTS.md` 或 Agent 编码规则中添加以下内容，明确要求在开发时使用对应 Skill。仅安装 MCP npm 包不会安装这些 Skill。

```markdown
When writing or modifying Android App code, apply the android-observable-code skill.
When writing or modifying iOS App code, apply the ios-observable-code skill.
```

单端项目可只保留对应的一行。这两个 Skill 指导以极低侵入复用或补充关键链路日志、稳定 UI 标识，便于 Mobile Easy Use 观察运行行为和验证改动。

## 灵感来源

Mobile Easy Use 受到 **quickjs-android**、**xLua**、**Frida** 等项目互操作机制的启发，重点借鉴了脚本运行时嵌入、JavaScript 或 Lua 与原生对象桥接，以及跨运行时调用平台能力等方面的设计思想。

- **quickjs-android**：展示了如何在 Android 中嵌入轻量 JavaScript 运行时，并连接 JavaScript 与平台原生能力。
- **xLua**：在脚本语言与宿主应用运行时之间的高效互操作方面提供了重要思路。
- **Frida**：提供动态插桩与跨平台运行时访问能力，使工具能够深入观察并操作真实运行中的 Android 和 iOS App。

在综合这些方案之后，Mobile Easy Use 最终选择 **基于 Frida 实现**，并将 Frida 的运行时能力进一步扩展为面向 AI Agent 的移动端 Tool，把运行时访问、受控交互、证据采集和可复用开发工作流连接在一起。

## 开发与发布

安装依赖并运行测试：

```bash
npm install
npm test
```

检查 npm 发布内容：

```bash
npm pack --dry-run
```

发布 npm 包：

```bash
npm publish --access public
```

npm 包名为 `@agent-easy-use/mobile-easy-use`。

---

**给 Agent 更多真实信息，让每一次分析、修改和验证都有据可依。**
