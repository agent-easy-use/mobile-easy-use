> 2026-09-29：配置已迁移到新版 breakpoint / observations API，结果为直接值和统一 errors。参数与局部变量均按名字读取。内嵌 NUL 字符串问题暂不处理，相关测试数据已移除；char 类型的边界值覆盖保留。

# Android debugger 变量读取真机验证

直接导入当前 SDK `debuggerProbe`，使用 AAR 中的 `libmobile_easy_use_native.so`。不使用旧 JVMTI 原型的读取实现。

## 覆盖矩阵

每种变量同时覆盖 `observations: {key: "name"}` 直接读取和 `observations: {key: ({get}) => ...}` 计算回调；参数和局部变量均通过名称解析。目标分别为静态方法和实例方法，每个方法触发 5 次，验证 long/double 等类型的实际读取结果。

| 类型 | 样例 |
|---|---|
| boolean | true / false |
| byte / short / int | 最小值、最大值、-1、0、1 |
| char | NUL、U+FFFF、中文、ASCII |
| long | 超过 JS 安全整数的 9007199254740993、Long.MIN/MAX、-1、0；精确十进制断言 |
| float / double | 可精确表示的小数、负零、NaN、正负无穷；负零在 observation 回调内验证 |
| String | 中文、emoji |
| 对象 | Box 链式字段和方法调用、Integer 包装对象、null |
| 八种基本类型数组 | 内容读取，包含整数边界、宽整数、特殊浮点值 |
| 引用/多维数组 | String[]（含 null/空字符串）、int[][]（含空子数组） |
| 空值 | 空 int[]、null String[] |

直接 observation 对 Java wrapper 返回类型描述，对象数组逐元素生成快照；observation 回调通过 `get(name)` 读取对象，并直接使用数组 length/下标，浮点负零通过 Object.is 验证。两种路径均断言实际结果。void 不是可读变量类型，不属于该矩阵；写回、提前返回也不属于本组读取测试。

## 重跑

仓库根目录执行，需要项目依赖、Android SDK/NDK、CMake、构建用 JDK、ADB 和可安装 debuggable App 的 arm64 真机：

```bash
fixtures/android/ApiDemo/probe/debugger-read-types/build.sh <adb-serial>
node fixtures/android/ApiDemo/probe/debugger-read-types/run.mjs <adb-serial>
```

build 会更新本地 Maven AAR、构建并重装 ApiDemo，只在生成 APK 中将 Gadget 端口改为 18484。runner 核对 Gadget PID，创建并最终删除自己的 ADB 转发；停止断点、释放环境和 Frida 脚本后检查 App 仍存活。

构建日志、编译产物、逐次原始观测保存在 `artifacts/benchmarks/debugger-read-types/`（不进入 Git）。再次单独运行 runner 可验证同进程重注册。

条件、写回、提前返回、异常和生命周期验证见 [MVP probe](../debugger-mvp/README.md)，后续统一执行。

## 结果

2026-09-30 类型转换对齐后，重新构建安装，在 HUAWEI JAD-AL50（Android 12 / API 31 / arm64）复测通过：

- 静态方法 5 次命中，250 项观测全部通过。
- 实例方法 5 次命中，250 项观测全部通过。
- 探针停止、脚本卸载和 Frida detach 后 App 进程保持存活，测试端口转发已移除。

完整结果位于 `artifacts/benchmarks/debugger-read-types/result.json`（不进入 Git）。此前内嵌 NUL 字符串断言失败的问题暂不处理；本次通过仅代表调整后的覆盖范围，不表示该问题已修复。
