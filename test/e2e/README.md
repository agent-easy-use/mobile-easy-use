# ApiDemo 模拟器 E2E

Host 壳复用 `GadgetConnection.connect/callFunction/disconnect`，在 App 内执行测试文件导出的 `run()`。不 mock SDK、Frida、LLDB 或原生行为，不在 Host 重复业务断言。

文件职责：

- `run.mjs`：共用的测试发现、SDK 构建、脚本打包、执行、超时、报告和清理编排。
- `android.mjs`：Android 模拟器选择、预构建 App 安装启动、系统信息和端口转发清理。
- `ios.mjs`：iOS 模拟器选择、预构建 App 安装、Runner JS 构建、系统信息和连接端口。
- `command.mjs`：共用的子进程命令执行。
- `output.mjs`：终端进度、阶段计时和结果汇总。

## 运行 click

双端会按 `config.json` 自动启动已安装的模拟器。Android 要求 Android SDK 和已构建的 APK；iOS 要求 Xcode、已构建的模拟器 `.app`，以及项目已有的 Runtime 和 XCTest Runner 环境。入口不创建模拟器、不下载 Runtime，也不修改签名配置。

从仓库根目录执行：

```bash
npm run test:e2e -- --platform android
npm run test:e2e -- --platform ios
```

Android 配置位于 `test/e2e/config.json`：

```json
{
  "android": {
    "avd": "ApiDemo_API_31",
    "port": 5556
  }
}
```

不传 `--device` 时固定使用配置的 AVD 和端口（此处为 `emulator-5556`），未启动则自动启动，最多等待 180 秒完成开机。端口必须为 5554～5682 的偶数；配置端口运行了其他 AVD 时直接报错。启动日志保存到本次报告目录的 `emulator.log`。运行结束后保留模拟器。

显式 `--device` 可选择其他已启动的模拟器；仅配置对应的设备支持自动启动。AVD 必须预先安装，不自动下载镜像或创建 AVD。iOS 使用配置的 UDID，显式 `--device` 可覆盖，未启动时自动启动。入口不会自动选中真机。

iOS 配置在同一文件中：

```json
"ios": {
  "udid": "FEE282C7-03EB-4A43-A61D-41661A7A6BBD"
}
```

使用 `xcrun simctl list devices available` 查看本机可用 UDID。启动后通过 `simctl bootstatus` 等待系统就绪，最多等待 180 秒；结束后保留模拟器。不自动创建模拟器或下载系统镜像。

默认运行 `drive/click`，支持：

```bash
npm run test:e2e -- --platform android --suite drive/click
npm run test:e2e -- --platform ios --suite all
```

双端在 `config.json` 各自的平台配置中通过 `artifact` 指定安装产物：

```json
"android": {
  "avd": "ApiDemo_API_31",
  "port": 5556,
  "artifact": "fixtures/android/ApiDemo/app/build/outputs/apk/auto/debug/app-auto-debug.apk"
},
"ios": {
  "udid": "FEE282C7-03EB-4A43-A61D-41661A7A6BBD",
  "artifact": "fixtures/ios/ApiDemo/.derived-data/Build/Products/ProbeDebug-iphonesimulator/ApiDemo.app"
}
```

路径支持绝对路径或相对仓库根目录的路径。E2E 不编译原生集成库或 ApiDemo，不执行 Gradle / ApiDemo xcodebuild，直接安装指定 APK / 模拟器 `.app`；产物不存在或不能安装时直接失败。原生源码变更后，调用方需先自行构建产物。已移除 `--refresh-dependencies` 参数。

运行时仍构建 SDK JS、presets、iOS Runner JS 并打包测试脚本。测试直接导入的新 SDK 模块会打包到测试 ESM 中，Frida bridge 使用 SDK 已安装的真实全局实例。产品连接流程仍负责 XCTest 执行端的准备。

已安装 App 时可显式复用：

```bash
npm run test:e2e -- --platform android --reuse-app
```

此模式仍构建 SDK、presets 和测试脚本，但不构建/安装原生 App；报告会注明已有安装未重建，不能据此宣称原生源码变更已验证。

## 测试发现与结果

- 发现 `fixtures/{platform}/ApiDemo/tests/` 的能力子目录内 `.js` 文件，递归发现时排除 `helpers/`；旧的根目录平铺脚本不在本入口执行范围内。
- 每个文件导出 `run()`，返回现有 Test 报告。加载阶段不得操作 App。
- 顺序执行，首个失败后停止，后续文件保留 `notRun`，避免在未知状态中继续操作。
- `--timeout 60000` 设置单个文件 run 的 Host 超时；连接和清理有独立超时。
- 报告保存在 `artifacts/e2e/<时间>-<平台>-<进程号>/report.json`，包括设备、系统、源码状态、安装产物路径、App 内报告和基础设施错误。
- 指定测试全部完成且通过才退出 0。断言失败、环境失败、超时或未完成均退出 1。
- 最后断开测试连接并移除本次创建的 Android 端口转发；保留模拟器和 ApiDemo，便于查看。清理超时也报告失败。Host 超时不意味着 App 内操作已经被取消；失败后不要继续依赖其业务状态，应重置后重跑。

## 当前边界

壳目前用于 ApiDemo 的 App 内测试，不实现通用设备管理、自动失败重试或脚本卸载后的 Host 生命周期用例。打包使用与 presets 相同版本的 `esbuild-wasm@0.25.12`，首次使用需要可访问 npm registry。

当前 Android 点击实现依赖原生输入注入；普通安装的 ApiDemo 可能没有 `INJECT_EVENTS` 权限。遇到此情况，用例会如实失败，壳不会用 adb 点击替代被测的 drive API。

2026-11-16 实际验证：iOS 26.0 模拟器完成构建、安装并通过 click；Android 16 模拟器完成构建、安装和用例执行，但点击因上述权限失败。另以 `--timeout 1` 验证了 Host 超时报错及连接、临时转发的清理。这些结果不代表真机覆盖。

## 终端输出

交互式终端显示动态进度和实时耗时，通过为绿色、失败为红色；每阶段结束后保留耗时。最后汇总 test 的通过、失败、未执行数量及报告路径。未返回用例报告的文件单独提示。错误堆栈保留在 JSON 报告中，终端突出错误原因。

输出重定向或在非交互环境运行时，自动使用无颜色、无动画的逐行文本；设置 `NO_COLOR` 可关闭终端颜色。

终端每个 `test()` 只展示一行名称和通过状态，失败时附上失败 expect 的 message（或运行 / hook 错误），通过时不展开断言。失败 test 排在通过 test 前，两类合计默认展示 10 条，通过 `--report-limit 20` 调整；0 关闭用例列表。未执行项单独统计，不归为失败。显示限制不影响 JSON 报告中的完整结果。

```bash
npm run test:e2e -- --platform ios --suite drive/click --report-limit 20
```
