# SDK 测试迁移记录

2026-11-24：移除 test 根目录剩余 16 个 SDK mock/本机原生宿主测试，以及 test/fixtures 下对应的 4 个 C/Objective-C 宿主文件。
SDK 行为改由双端 ApiDemo 的真实运行结果验证。test 根目录只保留 Agent.md。

## 场景去向

以下路径相对于对应平台的 ApiDemo/tests/。迁移的是行为契约，不是原有 mock 的调用次数和资源计数。

| 已移除文件 | 真实环境入口及处理 |
| --- | --- |
| android-sdk.test.js | common/runtime：主线程值/Promise/异常；drive/click、input、wait：目标与输入；inspect/ui：原生 View 查询、状态与几何。旧 AndroidExp/Override.run 不迁移 |
| ios-sdk.test.js | common/runtime：主线程和类查找；drive/windows：多窗口与动态遮挡；drive/runner-validation：过期及方向不匹配；inspect/ui：状态、裁剪和坐标 |
| android-static-hook.test.js | inspect/method、override/method 的真实静态方法场景；不再用模拟 ART 符号证明兼容性 |
| chain-thread.test.js | common/runtime 的主线程，以及 inspect/method-boundaries、inspect/log 的具名原生工作线程 |
| inspect-log.test.js | inspect/log：独立/重叠订阅、容量、原生线程与订阅变更；inspect/unload.lifecycle：卸载后恢复订阅 |
| android-inspect-log-native.test.js | Android inspect/log、inspect/unload.lifecycle；不再把桌面 CModule 宿主通过当成 Android 通过 |
| ios-inspect-log-native.test.js | iOS inspect/log、inspect/unload.lifecycle；使用真实 App 内的 NSLog |
| inspect-method.test.js | inspect/method-boundaries：递归、capture 异常、10000 条容量、并发原生线程、采集回调中 stop；iOS 还验证嵌套 watcher 恢复 |
| ios-inspect-method-native.test.js | iOS inspect/method-boundaries：double、NSRange、BOOL、int64/uint64 ABI；inspect/method：对象参数；inspect/unload.lifecycle：卸载恢复 |
| ios-input-driver-routing.test.js | drive/runner-validation：真实 Runner 拒绝过期和方向不匹配；drive/background.lifecycle：后台拒绝与重新前台化；普通输入由 drive/input 覆盖 |
| ios-input-events.test.js | drive/timeout.lifecycle：原生长按仍在执行时超时，拒绝重放，原生手势结束后仍拒绝重放，关闭 Runner 后恢复；不 mock 事件合成器 |
| ios-override-properties.test.js | override/field：原生自定义访问器、readonly/缺失属性、weak 生命周期、App 中途写入后的恢复 |
| overrides.test.js | override/method、field、code：新异步签名、独立 remove、静态成员、重复覆盖、嵌套恢复和重新安装；旧目录/同步签名丢弃 |
| ios-ui-geometry.test.js | inspect/ui：从实际 UIKit/Frida 获得 CGRect，验证 layout 与变换，不为伪造结构建立平行测试 |
| ui-check-state.test.js | inspect/ui、drive/wait：原生状态、透明祖先、裁剪、脱离窗口；matcher 正反结果与错误传播已有 test/framework/expect.test.js |
| ios_inspect_code_test.py | inspect/code、inspect/code-limits、common/debugger：条件、分发、部分表达式失败、记录容量及停止；Host 符号配置独立保留在 test/mcp |

## 生命周期测试

`.lifecycle.js` 使用现有 Host arm → disconnect → reconnect → run 链路，并核对 PID 未变化。
arm 中的断言失败也使整份用例失败；run 验证清理后的真实行为。

- inspect/unload.lifecycle：不主动 stop，卸载后重新安装 watcher 并验证原生结果。
- drive/timeout.lifecycle：不使用固定 sleep 制造假完成；原生长按持续时间超过请求截止时间，通过手势状态回到 idle 验证原生事件结束。Host 关闭已进入 uncertain 状态的 Runner 后再运行验证，因此不依赖套件顺序。
- drive/background.lifecycle：原生 fixture 申请后台任务，待 UIApplicationStateBackground 后提交命令；Host 显式恢复前台并重连，验证同一 App 可以再次接收输入。后台任务在结束或系统过期时释放。

## 测试中的对象生命周期

iOS weak 验证使用明确的 autorelease pool 边界。weak 读取及 bridge 调用可能留下临时所有者，不能在 pool 未清理时就把对象存活判断为 SDK retain 泄漏。
ApiDemo 的 APIOverrideFieldsFixture 新增 customMode（自定义 getter/setter）与 readonlyMode；本轮重新构建 iOS App 后安装验证。双端 ChainCaptureFixture 新增 startLogWorkers：两个原生线程各产生 1000 条唯一日志，并提供完成计数。本轮分别用 Gradle 和 Xcode 重建双端 App；E2E 壳本身仍只安装指定产物。

## 覆盖边界

- 不声称已验证其他 Android/OEM 的私有 root 获取路径、不同 ART 符号布局或其他 iOS 主版本。模拟器结果只证明报告中的系统版本。
- 删除仅检查内部 getter 调用次数、缓存实现、mock retain/release 次数及虚构 native 符号缺失的断言；这些不是实际平台兼容性的证据。
- 不把人工构造的 LLDB 无效 frame、Python callback 抛错、原生 allocator/free 失败等全部复制为 App 故障注入。真实部分表达式失败、条件错误、安装失败、会话卸载已有独立场景；系统级故障不是本轮验证范围。
- 输入验证覆盖可观察的原生行为；不再断言每个私有事件类内部的调用顺序。瞬时前后台/旋转竞争不等同于已穷举所有系统时序。
- 类型检查继续在 test/integration/sdk-declarations.test.js，运行时 E2E 不替代声明检查。

## 执行记录

本轮已重建双端 ApiDemo，并执行以下模拟器用例。分批报告存在重叠，不将其简单相加作为独立用例总数。

| 平台 | 范围 | 通过 test 数 | 报告 |
| --- | --- | --- | --- |
| android | inspect/code, inspect/log, inspect/method-boundaries, inspect/method, inspect/ui-screenshot, inspect/ui | 34 | [2026-11-24T02-44-08.253Z-android-43790](../../artifacts/e2e/2026-11-24T02-44-08.253Z-android-43790/report.json) |
| android | common/runtime | 1 | [2026-11-24T02-45-18.420Z-android-46925](../../artifacts/e2e/2026-11-24T02-45-18.420Z-android-46925/report.json) |
| android | override/code, override/field, override/method | 41 | [2026-11-24T02-45-48.028Z-android-48114](../../artifacts/e2e/2026-11-24T02-45-48.028Z-android-48114/report.json) |
| ios | inspect/code, inspect/log, inspect/method-boundaries, inspect/method, inspect/ui-screenshot, inspect/ui, inspect/unload.lifecycle | 34 | [2026-11-24T02-46-10.345Z-ios-48438](../../artifacts/e2e/2026-11-24T02-46-10.345Z-ios-48438/report.json) |
| android | inspect/unload.lifecycle | 1 | [2026-11-24T02-46-38.347Z-android-49074](../../artifacts/e2e/2026-11-24T02-46-38.347Z-android-49074/report.json) |
| android | inspect/ui | 12 | [2026-11-24T02-47-05.613Z-android-49519](../../artifacts/e2e/2026-11-24T02-47-05.613Z-android-49519/report.json) |
| ios | override/code, override/field, override/method | 16 | [2026-11-24T02-49-31.346Z-ios-51938](../../artifacts/e2e/2026-11-24T02-49-31.346Z-ios-51938/report.json) |
| ios | common/runtime | 2 | [2026-11-24T02-49-56.524Z-ios-52411](../../artifacts/e2e/2026-11-24T02-49-56.524Z-ios-52411/report.json) |
| android | drive/click, drive/input, drive/wait | 20 | [2026-11-24T02-51-09.573Z-android-53425](../../artifacts/e2e/2026-11-24T02-51-09.573Z-android-53425/report.json) |
| ios | drive/windows | 8 | [2026-11-24T02-53-19.001Z-ios-56168](../../artifacts/e2e/2026-11-24T02-53-19.001Z-ios-56168/report.json) |
| android | inspect/log | 4 | [2026-11-24T02-54-52.599Z-android-59134](../../artifacts/e2e/2026-11-24T02-54-52.599Z-android-59134/report.json) |
| ios | drive/background.lifecycle | 1 | [2026-11-24T02-58-30.285Z-ios-64845](../../artifacts/e2e/2026-11-24T02-58-30.285Z-ios-64845/report.json) |
| ios | inspect/ui | 12 | [2026-11-24T02-59-16.664Z-ios-65297](../../artifacts/e2e/2026-11-24T02-59-16.664Z-ios-65297/report.json) |
| ios | inspect/log | 4 | [2026-11-24T03-05-29.329Z-ios-68435](../../artifacts/e2e/2026-11-24T03-05-29.329Z-ios-68435/report.json) |
| ios | override/field | 8 | [2026-11-24T03-05-53.237Z-ios-68873](../../artifacts/e2e/2026-11-24T03-05-53.237Z-ios-68873/report.json) |
| ios | common/runtime | 2 | [2026-11-24T03-06-12.363Z-ios-69514](../../artifacts/e2e/2026-11-24T03-06-12.363Z-ios-69514/report.json) |
| ios | drive/background.lifecycle, drive/click, drive/input, drive/runner-validation, drive/timeout.lifecycle, drive/wait, drive/windows | 32 | [2026-11-24T03-06-37.538Z-ios-71648](../../artifacts/e2e/2026-11-24T03-06-37.538Z-ios-71648/report.json) |
| android | common/runtime | 1 | [2026-11-24T03-07-49.858Z-android-73385](../../artifacts/e2e/2026-11-24T03-07-49.858Z-android-73385/report.json) |

无设备验证：`npm test` 180 通过、2 跳过、0 失败；`python3 -m unittest discover -s test/mcp -p "*_test.py"` 20 通过。跳过项为显式开启的 presets 构建检查。

### 未通过：iOS 断点容量压力测试

`inspect/code-limits` 保留真实的 10,000 条容量上限，并验证超限后原生调用继续完成、后续 watcher 可用。此项尚未获得通过结果：

- 单批 10,001 次断点：180 秒超时，断连清理也超时。
- 改为每批 100 次、批间归还 App 主线程后：仍在 240 秒超时，断连清理在 15 秒超时。[失败报告](../../artifacts/e2e/2026-11-24T03-08-41.569Z-ios-74083/report.json)。
- 运行中 LLDB 采样包含断点回调、继续执行及事件轮询；退出后的采样停在进程销毁等待。尚不能判定最初超时是吞吐不足还是运行时异常，不能宣称容量及超时清理已验证。
- 保留失败用例，不降低容量、不静默跳过。测试超时后已清理本轮残留 LLDB/App 进程。运行此压力用例需要显式指定超时；默认 60 秒不适合本次观察到的耗时。

复现：

```sh
node test/e2e/run.mjs --platform ios --suite inspect/code-limits --timeout 240000
```

后续应记录每批完成进度，测量断点处理吞吐，并单独定位超时后的 detach/LLDB 退出阻塞。此项不计入上表通过范围；本轮没有修改 debugger 产品实现来绕过问题。
