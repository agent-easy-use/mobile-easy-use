# JVMTI agent 两种 APK 打包方式回归

从仓库根目录运行：

```bash
fixtures/android/ApiDemo/probe/debugger-agent-loading/run.sh <adb-serial>
```

脚本发布当前 Android SDK AAR，依次构建 `useLegacyPackaging=true`（解压 so）和 `false`（APK 内直接加载 so）的 ApiDemo，安装并重启应用。通过临时 Gradle init script 覆盖打包设置，不修改 App 默认配置。需要 adb、Android SDK build-tools 35.0.0、debug keystore 及项目 Node/Gradle 依赖。

每种模式验证 APK 内 so 的压缩方式、ClassLoader 解析出的路径、首次注册前未加载 agent、注册后从安装目录加载，以及连续两轮脚本加载/断点命中/卸载。每轮检查 3 次参数、local 和调用栈观测及 Java 执行结果。记录安装路径是否包含 `=`；不同系统不保证生成此字符，不将其作为所有设备的前置条件。

产物和成功/失败证据保存在 `artifacts/benchmarks/debugger-agent-loading/`，包括两份 APK、manifest、构建日志和 `legacy-result.json`、`apk-result.json`。结束后保留最后一种模式的 ApiDemo 安装；runner 释放探针和自身创建的端口转发。

2026-09-28 真机结果：HUAWEI JAD-AL50 / Android 12 / API 31 / arm64，两种模式均通过；每种 2 轮脚本生命周期、6 次断点命中，安装路径均包含 `=`。此结果不代表全部 Android 版本和设备组合。

2026-09-29 新 API 回归：Android 16 / API 36 / arm64 模拟器，两种模式均通过，每种 2 轮脚本生命周期、6 次命中；配置和结果断言已迁移到 breakpoint、独立 stack 和直接 observation 值。

2026-09-29 新 API 真机复测：HUAWEI JAD-AL50 / Android 12 / API 31 / arm64，两种模式均通过。每种完成 2 轮脚本生命周期、6 次断点命中；安装路径均包含 `=`，agent 均从安装目录或 APK 内直接加载，无临时复制。另在两种安装模式下各执行 136 组新版主回归，全部通过。证据为本轮 `legacy-result.json`、`apk-result.json`，主回归证据见 [MVP probe](../debugger-mvp/README.md)。
