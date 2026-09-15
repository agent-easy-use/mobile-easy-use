# Mobile Easy Use

**面向 Android / iOS 开发者，让 AI Agent 访问 App 运行时，理解、探查、调试 App，并执行 UI 自动化测试。**

文档：[English](../README.md) · **简体中文** · [Français](./README.fr.md) · [Русский](./README.ru.md) · [Español](./README.es.md) · [العربية](./README.ar.md)

相比 Web，移动 App 更难直接查看内部数据、业务状态和执行过程。**“数据请求成功了，列表为什么没有更新？”** 这类问题取决于实际数据、状态和执行时序，仅靠静态源码分析往往无法判断。

Mobile Easy Use 通过 MCP 让 AI Agent 访问 App 运行时，将源码与 App 的实际行为联系起来，让开发判断有真实运行信息可依。

https://github.com/user-attachments/assets/e956fdbf-da6a-4608-a877-11a107f70760

## 探查 App 的状态与行为

Agent 可以将用户看到的界面表现与 App 内部的实际运行情况联系起来，理解业务行为、定位问题：

| 运行时信息 | 可以了解什么 |
| --- | --- |
| 业务对象与状态 | 当前数据、缓存、配置和业务状态，以及操作前后的变化 |
| 方法调用 | 触发了哪些方法，参数、返回值、调用栈和执行线程是什么 |
| 执行耗时与内存变化 | 方法执行了多久，调用前后进程内存如何变化 |
| 业务日志 | 执行到了哪个阶段，出现了什么异常线索 |
| 界面与控件状态 | 控件是否存在、是否可见、位置和属性是什么 |
| 页面与元素截图 | 实际画面，以及操作前后的视觉变化 |
| App 资源 | Android 控件和配置对应的资源标识及内容 |
| 操作结果与失败现场 | 操作在哪一步失败，以及当时获取的状态、日志和图像 |

具体可获取的信息取决于平台和 App 的实现。

这些运行信息贯穿 Agent 的编码过程：

- **调研与编码前**：结合源码查看实际调用、数据和状态，理解现有实现。
- **技术方案验证**：临时调整配置、字段或方法返回值，验证关键假设，完成后恢复。
- **问题定位**：关联调用链、业务状态和 UI 表现，找出异常环节。
- **编码后**：重跑原场景，检查修改效果，确认后的预期可沉淀为回归测试。

例如，让 Agent 验证一个方案：

```text
检查这个受配置开关控制的页面：确认当前配置和实际调用路径，
再临时切换开关，验证两种状态下的数据和 UI，完成后恢复。
结合运行证据判断方案是否可行，并说明仍未验证的部分。
```

## 也可用于 UI 自动化测试

同样的运行时能力可以用于更深入的 UI 自动化：执行点击、输入、滚动，并在同一用例中验证 **UI 状态、截图和原生业务状态**。例如，刷新列表后，既检查界面显示，也直接确认内部数据已更新。临时行为覆盖帮助构造测试条件，调用与状态证据帮助定位失败原因。

下表对比以 UI 交互和界面断言为主的测试方式：

| 测试任务 | 以 UI 为主的测试 | Mobile Easy Use |
| --- | --- | --- |
| 验证操作结果 | 检查文本、控件和截图是否符合预期 | 同一次操作还可断言原生对象、缓存和业务状态，确认内部结果也正确 |
| 验证中间状态 | 等待界面呈现的状态变化 | 直接读取内部状态，检查加载中、待处理、已完成等状态转换 |
| 构造测试场景 | 通过 UI 步骤和可用测试数据进入目标状态 | 还可临时覆盖字段或方法返回值，触发特定分支 |
| 分析测试失败 | 查看失败断言、截图和已有日志 | 进一步关联方法调用、参数、返回值和状态变化，解释失败原因 |

### 示例：一次点击，验证业务状态、UI 和截图

在 Android ApiDemo 的 **UI → Class names and subclasses** 初始页面，点击 `FIRST` 后，计数应为 1，按钮应显示 `FIRST:1`，外观应符合基准。运行前进入该初始页面，并准备已审核的点击后截图 `baselines/first-clicked.jpg`，路径相对于用例文件。

完整场景与清理示例见 [Android tests](../fixtures/android/ApiDemo/tests/) 和 [iOS tests](../fixtures/ios/ApiDemo/tests/)。窗口比较可用 `expect().toHaveWindowScreenShot(...)`。

```javascript
const { describe, test, expect, run } = Test.create();
export { run };

describe('Counter button', () => {
  test('updates state, UI, and appearance', async () => {
    const button = R.id.api_ui_class_first;
    const clicked = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(button));
    expect(clicked.ok).toBe(true);

    // UI 状态
    await expect(button).toBeVisible();
    await expect(button).toSatisfy(view => String(view.getText()) === 'FIRST:1');

    // 截图
    await expect(button).toHaveElementScreenShot('baselines/first-clicked.jpg');

    // 原生业务状态
    const count = await AndroidExp.runOnMainThread(() => Java.use(
      'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState'
    ).getInstance().getClickCount());
    expect(Number(count)).toBe(1);
  });
});
```

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

`npx` 会获取并启动指定版本，无需先全局安装。按所用客户端的配置方式设置工作目录为**目标 App 项目根目录**，以便读取项目 Presets；Agent 与 MCP 需要共享本地文件系统，用于读取 SDK 声明、探查和测试文件。

重新加载 MCP 配置后，确认 Agent 能看到 `get_sdk_declarations`、`connect` 等工具。新建连接时，MCP 会检查 App Runtime Release 与 MCP 版本的兼容性；不匹配时会给出调整建议。

### 4. 开始探查或测试

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

生成测试与执行测试分别使用对应 Skill：

```text
使用 to-android-test-script，为列表刷新流程生成测试，验证 UI、截图和内部数据状态。
使用 to-android-test，执行这个 App 的 tests 目录下的用例，汇总通过、失败和未执行结果。
```

iOS 对应使用 `to-ios-test-script` 和 `to-ios-test`。

## Skills 导航

Android 与 iOS 各有对应 Skill，覆盖接入、探查、测试和复用。

| 能力 | 何时使用 | Android / iOS Skill |
| --- | --- | --- |
| **Observable** | 可选的编码辅助，以极低侵入性复用或按需补充日志、UI 标识与运行时入口，让 App 更好地配合 Mobile Easy Use | [android-observable-code](../skills/android-observable-code/SKILL.md) / [ios-observable-code](../skills/ios-observable-code/SKILL.md) |
| **Integrate** | 首次接入或维护调试集成，获取 Runtime 产物、配置工程，并确定兼容 MCP 版本；iOS 还包含 Runner 签名准备与修复 | [to-android-integrate](../skills/to-android-integrate/SKILL.md) / [to-ios-integrate](../skills/to-ios-integrate/SKILL.md) |
| **Probe** | 用自然语言发起一次运行时调查，完成探查生成、执行及证据分析 | [to-android-probe](../skills/to-android-probe/SKILL.md) / [to-ios-probe](../skills/to-ios-probe/SKILL.md) |
| **Test** | 根据明确预期生成测试文件；执行已有用例并汇总结果 | [生成 Android 测试](../skills/to-android-test-script/SKILL.md) / [iOS 测试](../skills/to-ios-test-script/SKILL.md)；[执行 Android 测试](../skills/to-android-test/SKILL.md) / [iOS 测试](../skills/to-ios-test/SKILL.md) |
| **Presets** | 把常用页面导航、业务操作和状态读取沉淀为带类型声明的可复用能力，构建后供 Probe 和 Test 使用 | [to-android-presets](../skills/to-android-presets/SKILL.md) / [to-ios-presets](../skills/to-ios-presets/SKILL.md) |

Probe 内部组合对应平台的 `to-*-probe-script` 和 `to-*-run`，分别负责生成与执行；日常使用从 Probe 入口提出问题即可。

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

依赖版本见 [package.json](../package.json)，App 侧二进制版本及第三方声明见 [Android 第三方声明](../integration/android/mobile-easy-use/THIRD_PARTY_NOTICES.md) 和 [iOS 第三方声明](../integration/ios/THIRD_PARTY_NOTICES.md)。Runtime Release 与 MCP 的兼容关系由[兼容目录](../distribution/README.md)维护。

## 本地开发

```bash
npm install
npm test
npm pack --dry-run
```

npm 包名：`@agent-easy-use/mobile-easy-use`。

## 反馈

使用探查或测试后，欢迎[分享使用场景和遇到的问题](https://github.com/agent-easy-use/mobile-easy-use/issues)。如果 Mobile Easy Use 对你的开发有帮助，可以 Star 收藏项目。
