# ApiDemo 根目录旧测试迁移

2026-11-24：清理 Android 15 个、iOS 14 个平铺脚本。新脚本使用当前 SDK 与 Test/expect，在模拟器 App 中执行；不再依赖 AndroidExp、IOS 或 Override.run。

| 原脚本（除标注外为双端） | 去向 |
| --- | --- |
| input-click.js | 已有 drive/click.js |
| long-press.js、text-input.js、scroll.js | 已有 drive/input.js |
| override-method.js、override-fields.js | 已有 override/method.js、field.js；不迁移旧 scope 自动恢复契约 |
| class-click.js | element/class-click.js：按 class 找到首个后代，点击后只有 FIRST 更新 |
| ui-path.js | element/query.js：混合路径精确定位原生子节点、缺失目标不同于隐藏 |
| ui-visibility.js | inspect/visibility.js：隐藏和自身零尺寸存在但不可见 |
| wait.js | drive/wait-transitions.js：延迟显示/隐藏、attach/detach、resize、立即完成、超时与轮询 |
| runtime.js | 合并到 common/runtime.js，移除不必要的 UI 导航 |
| Android resource.js | element/resources.js：R.id/R.string 对齐编译资源，缺失查询不影响后续查询；无需导航页面 |
| Android window.js | element/windows.js：Dialog/可聚焦 Popup 的实际目标与焦点，关闭后查询恢复；不依赖公开 getRootViews |
| iOS window.js | 已有 drive/windows.js |
| screenshot.js、window-screenshot.js | inspect/visual-element.js、visual-window.js：固定基准视觉回归 |

common/helpers/scenes.js 仅用于原生导航和场景就绪等待；导航不依赖被测 drive.click。根目录不再放置 JS 测试。baselines 保留固定基准资产，不纳入脚本发现。

双端基准重新采集并目视审核，设备、图片尺寸、哈希和更新约定见各平台 baselines/README.md。测试从固定文件读取基准，重新截图作比较，不在测试中生成基准。使用 __MEU_REPO_ROOT__ 定位文件，避免打包后相对路径指向临时目录。

## 验证

本轮按 element、drive/wait-transitions、inspect/visibility、common/runtime、inspect/visual-element、inspect/visual-window 分批执行。没有运行无关的 debugger 容量压力用例；其之前的超时问题不属于本轮验证通过范围。

| 平台 | 脚本 | 通过 test 数 | 报告 |
| --- | --- | --- | --- |
| android | common/runtime.js | 2 | [报告](../../artifacts/e2e/2026-11-24T03-23-20.511Z-android-85889/report.json) |
| android | drive/wait-transitions.js | 8 | [报告](../../artifacts/e2e/2026-11-24T03-23-10.221Z-android-85617/report.json) |
| android | element/class-click.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-22-50.550Z-android-85026/report.json) |
| android | element/query.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-22-50.550Z-android-85026/report.json) |
| android | element/resources.js | 2 | [报告](../../artifacts/e2e/2026-11-24T03-22-50.550Z-android-85026/report.json) |
| android | element/windows.js | 2 | [报告](../../artifacts/e2e/2026-11-24T03-22-50.550Z-android-85026/report.json) |
| android | inspect/visibility.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-23-16.759Z-android-85784/report.json) |
| android | inspect/visual-element.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-24-30.396Z-android-88243/report.json) |
| android | inspect/visual-window.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-24-34.285Z-android-88352/report.json) |
| ios | common/runtime.js | 3 | [报告](../../artifacts/e2e/2026-11-24T03-24-19.970Z-ios-87896/report.json) |
| ios | drive/wait-transitions.js | 8 | [报告](../../artifacts/e2e/2026-11-24T03-23-37.557Z-ios-86367/report.json) |
| ios | element/class-click.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-23-00.044Z-ios-85295/report.json) |
| ios | element/query.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-23-00.044Z-ios-85295/report.json) |
| ios | inspect/visibility.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-24-00.475Z-ios-87315/report.json) |
| ios | inspect/visual-element.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-25-27.500Z-ios-89307/report.json) |
| ios | inspect/visual-window.js | 1 | [报告](../../artifacts/e2e/2026-11-24T03-25-47.425Z-ios-89736/report.json) |

本轮选定脚本合计：Android 19 个 test、iOS 16 个 test，全部通过（包含合并后的 common/runtime 现有用例）。截图采集辅助脚本不计入上述数量，采集完成后已删除。CLI 输出测试 1 项通过；git diff --check 通过。
