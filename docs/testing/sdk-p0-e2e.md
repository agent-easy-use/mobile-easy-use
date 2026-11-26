# SDK P0 E2E

P0 是脚本开发者完成“进入场景 → 获取证据 → 修改行为 → 恢复现场”所需的常用能力。测试在真实 Android Emulator / iOS Simulator 的 ApiDemo 中执行，不 mock SDK、Frida 或 LLDB。测试设计遵循 [test/Agent.md](../../test/Agent.md)。

## 用例位置与验收

以下路径相对于各平台的 `fixtures/{platform}/ApiDemo/tests/`。

| 能力 | 文件 | P0 验收 |
| --- | --- | --- |
| 点击 | `drive/click.js` | ID/identifier、路径、原生对象、坐标；原生计数准确；无效目标不触发点击 |
| 输入、长按、滚动 | `drive/input.js` | 原生文本更新和焦点；长按回调一次；横纵滚动偏移方向正确 |
| 等待 | `drive/wait.js` | 异步原生状态变化；缺失目标超时；异步 predicate；失败后可继续等待 |
| UI | `inspect/ui.js`、`inspect/ui-screenshot.js` | 状态、树、布局、元素截图、窗口截图及标注；原生对象可继续操作 |
| 日志 | `inspect/log.js` | 精确 TAG、重叠订阅、元数据、累计快照、独立 stop 与重复 stop |
| 方法观测 | `inspect/method.js` | 默认记录、原生结果不变、filter、enter/leave 参数和结果、有限栈、静态方法、stop 恢复；Android 另测 overload 和异常 |
| 代码观测 | `inspect/code.js` | 原生现场值/表达式、条件、current/stop；Android 另覆盖并发和同位置多订阅；iOS 验证 OC 与 Swift |
| 方法覆盖 | `override/method.js` | 常量/函数返回、参数过滤、对象/字符串与 BOOL、静态方法、remove 恢复；Android 另测 overload 和重复覆盖拒绝 |
| 字段/属性 | `override/field.js` | 基础值和对象值、恢复、重复覆盖拒绝；Android 静态字段；iOS setter/getter 及继承属性 |
| 代码覆盖 | `override/code.js` | 条件、局部变量修改、原生提前返回结果、remove 恢复；iOS Swift 局部变量修改 |

平台差异按实际契约保留：Android method 经 Java bridge 转换；iOS method 的 callback 参数及返回值遵循原生 ABI，对象指针显式转换。iOS field 使用 property 名称和访问器，Android 使用字段名。iOS 原生异常展开、可变参数尾部和 Swift 提前返回类型完整覆盖不列入已保障能力。

## 执行

```sh
npm run test:e2e -- --platform android --suite drive --timeout 180000
npm run test:e2e -- --platform android --suite inspect --timeout 180000
npm run test:e2e -- --platform android --suite override --timeout 180000
npm run test:e2e -- --platform ios --suite drive --timeout 180000
npm run test:e2e -- --platform ios --suite inspect --timeout 180000
npm run test:e2e -- --platform ios --suite override --timeout 180000
```

每个平台按顺序执行；不要同时运行两个操作同一 App 的任务。`--suite` 按目录发现用例，不维护额外 P0 注册表。`common/debugger` 的内部回归和卸载测试仍可单独运行。

E2E 安装 `test/e2e/config.json` 指定的预构建 App，不编译原生代码。SDK、测试脚本和 presets 使用工作区源码。报告记录产物路径和版本。新增用例未执行或某项失败时，不视为该项 P0 已保障。

## 已知边界

- 当前 Android 输入验证环境为 Android 12 模拟器；不代表 Android 16 的输入注入权限问题已解决。
- iOS Swift Int 提前返回已有独立失败记录，本清单不掩盖该限制；OC 提前返回与 Swift 局部变量修改分开验证。
- 这里只覆盖 P0，不声称已替代所有旧 mock 中的并发、容量、所有 ABI、weak property 和异常场景。

## 2026-11-20 执行结果

Android 12 / iOS 26.0.1 模拟器：六组共 138 项通过。本轮新增 46 项，其余为已有用例回归。原生 App 未重建。

| 平台 | 目录 | 通过 | 报告 |
| --- | --- | --- | --- |
| Android | `drive` | 20 | [report](../../artifacts/e2e/2026-11-20T08-32-31.888Z-android-75655/report.json) |
| Android | `inspect` | 27 | [report](../../artifacts/e2e/2026-11-20T08-34-13.557Z-android-78009/report.json) |
| Android | `override` | 40 | [report](../../artifacts/e2e/2026-11-20T08-33-45.296Z-android-77335/report.json) |
| iOS | `drive` | 20 | [report](../../artifacts/e2e/2026-11-20T08-32-33.594Z-ios-75911/report.json) |
| iOS | `inspect` | 20 | [report](../../artifacts/e2e/2026-11-20T08-34-30.192Z-ios-78442/report.json) |
| iOS | `override` | 11 | [report](../../artifacts/e2e/2026-11-20T08-33-47.005Z-ios-77462/report.json) |

报告是本机生成产物，不随代码提交。测试源码另通过语法检查和 `git diff --check`。

排查中修正了旧 click 对 AndroidExp preset 的依赖，以及 iOS 首页不能调用 capability controller 返回入口的问题。Android String 字段按 Frida 高层转换验证原值恢复，普通 Java 对象另验证引用恢复；不继续套用旧 fixture 对 String 身份相同的断言。
