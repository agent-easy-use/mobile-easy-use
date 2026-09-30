# Android JVMTI → Frida debugger 真机验证

2026-09-21，在 HUAWEI JAD-AL50（Android 12 / API 31 / arm64）上的 debuggable ApiDemo 验证通过。
同一 PID 27869 中完整执行两轮，每轮 21 个场景、199 次非重入命中，另有 3 次重入被保护逻辑跳过。
这是一套可重跑的底层可行性原型，**不是生产 `probe.debugger` SDK 实现**。

## 验证结果

| 项目 | 实测结果 |
|---|---|
| 独立环境 | `Debug.attachJvmtiAgent` 创建独立 JVMTI env，地址与 `Java.api.jvmti.handle` 不同；所需 5 项 capabilities 全部可用 |
| 方法定位 | Frida `.handle` 直接作为 `jmethodID`；按行号表选择最小 location，无需反射或解析 ArtMethod 私有结构 |
| Java/Kotlin | Java static/instance 方法、Kotlin `JvmtiTopLevelKt.topLevelCompute` 均命中指定源码行 |
| local | 依变量名和当前 location 的作用域取槽位，读取 `local` 正确 |
| argument | 不用参数名：根据 ART 参数寄存器区和签名定位 int/object/long/double，实例方法排除 this |
| Frida script | 从 GetLocalObject 包装为 Frida 对象，读取 `box.config.version`，调用 `box.read()`，返回 `jvmti-frida` |
| setBinding | Java helper 返回后核对 frame 0；int local、int 参数、对象参数替换均影响原方法后续结果 |
| 宽类型写回 | long 写入 `9007199254740993` 并精确读回；double 写入 9.75；后续业务结果为 `[30,32,34]` |
| forceReturn | Int=777、Object=`forced-object`、Void 均成功，方法尾部计数和 finally 计数为 0 |
| 控制错误 | 第二次返回请求报告冲突；脚本写回后抛错会取消待执行返回，但已完成的写回保留 |
| 条件 | 6 次底层命中、仅保留 3 条奇数参数记录；条件错误保留错误并继续业务 |
| stack | 3 层，首帧是目标方法，含类名、方法名、源文件和源码行 |
| 并发 | 4 线程 × 25 次：100 条记录、100 个不同 hitId、所有参数和业务结果正确 |
| 再入 | script 再次调用目标方法，业务调用正常完成；跳过重复观测并计数 |
| JNI/GC | 回调内主动 GC 后对象仍可读；回调使用 JNI local frame，待返回对象使用 global ref 并释放 |
| stop | 重复 clear 正常；在途回调完成后结果可收齐；后续调用不再命中；清理不会撤销已有修改 |
| hook 冲突 | 当前脚本中已设置 `.implementation` 的目标在注册时被拒绝，恢复后可继续断点 |
| 负向测试 | 无对应行、缺失 local、非法 slot 都明确报错，未悄悄换行或返回假值 |
| 生命周期 | DisposeEnvironment → script unload → Frida detach 后进程存活；相同 PID 重跑完整测试通过 |

### 关键发现：ART 参数槽位

静态测试方法的局部变量位于 slot 0，参数分别位于 `[3,4,5,7]`。
实例方法参数位于 `[4,5,6,8]`，Kotlin 顶层函数位于 `[3,4,5,7]`。
不能照搬 HotSpot 从 slot 0 开始的参数布局：

```
base = GetMaxLocals(method) - GetArgumentsSize(method)
firstArgument = base + (isStatic ? 0 : 1)
```

再按签名累加前面参数的宽度（long/double=2，其他=1）。参数 index 不依赖局部变量表；local name 仍依赖它。
[AOSP ART 实现](https://android.googlesource.com/platform/art/+/refs/heads/main/openjdkjvmti/ti_method.cc)返回 DEX 的 registers size 和 ins size，与真机结果一致。

### 关键发现：清理与重新初始化

清除断点不等于 drain 完成。本轮特意让回调停留在 native gate，先 clear，再释放 gate，验证在途记录完成且第二次业务调用不再命中。

DisposeEnvironment 不会卸载 native `.so`。原型第一次尝试整轮重载时，旧的“重入计数=3”仍留在静态变量中，导致新一轮断言失败；已修正为每次 Agent_OnAttach 重置会话状态。修正后同一进程两轮均通过。

## 文件与证据

- `agent.cpp`：独立 JVMTI env、断点回调、读写、延迟提前返回、引用和清理。
- `agent.js`：Frida 方法解析、绑定读取、各场景的 script、条件、栈和错误记录。
- `run.mjs`：Host 驱动断言；ADB 启动 Activity，让业务在独立 Java 线程触发断点。
- `build.sh`：构建 arm64 native agent、ApiDemo、隔离 Gadget 端口的 APK，并可部署到指定设备。
- [device-result.log](device-result.log)：最终一轮的原始运行输出。
- [device-summary.json](device-summary.json)：两轮环境、场景与清理状态索引。
- 完整逐次命中原始证据保存在仓库 `artifacts/benchmarks/jvmti-debugger-20260921/result-first.json` 与 `result.json`；构建、安装和运行日志也在该目录。该目录按仓库规则不进入 Git。

注意：原型的原始记录还包含测试诊断字段，stack 类名使用 JVM descriptor。它不是方案中的最终 evidence schema；条件错误结构、按 observation 的控制意图归属和结果序列化仍由 SDK 实现落地。

## 重跑

从仓库根目录执行。需要本机已安装项目依赖、Android SDK、NDK 29、JDK 17、ADB，设备运行 Android API 31/arm64 且可安装 debuggable ApiDemo。

```bash
fixtures/android/ApiDemo/probe/jvmti-debugger/build.sh <adb-serial>
node fixtures/android/ApiDemo/probe/jvmti-debugger/run.mjs <adb-serial>
```

`build.sh` 默认使用当前 macOS 的 SDK/JDK 位置，可通过 `ANDROID_SDK_ROOT`、`DEBUGGER_NDK`、`DEBUGGER_JDK` 覆盖。JDK 只提供构建时的 jvmti.h，不是运行时 Host 依赖。

部署会重启 **ApiDemo** 并安装实验 APK。仅在生成的 APK 内把 Gadget 端口改成 18484，不修改 SDK/AAR。runner 创建动态 Host 转发，核对 Gadget PID 与 ApiDemo 一致，只删除自己创建的转发。本次保留了原有 tcp:18484→tcp:8484、tcp:12500→tcp:8901，未操作 TT。

再次运行 `run.mjs` 即验证同进程重新建立环境；不需要重新安装。正常结束时先 clear/drain，再 dispose env/unload/detach。

## 实测范围之外

未验证非 debuggable App、其他系统/厂商版本、所有基本类型的提前返回、混淆/优化组合、其他 Frida session 的 hook 检测、跨 debugger 的共享断点所有权、Host 突然断开/强杀时自动回收、持久化传输背压和长期泄漏。
主动 GC 样例通过不等于完成泄漏证明；Java/native 任意调用仍可能等待业务锁。测试 runner 的超时不能安全取消任意目标代码。
