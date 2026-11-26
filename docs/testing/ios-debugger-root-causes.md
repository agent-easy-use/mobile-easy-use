# iOS debugger 根因复查与修复

验证日期：2026-11-20。环境：Apple LLDB `lldb-1703.0.31.2` / Swift 6.2、iPhone 17 模拟器 iOS 26.0.1、Frida 17.16.4。使用预构建 ApiDemo ProbeDebug；本次没有修改原生编译参数或放宽断言。

## 1. 更正此前的结论

此前把“同会话条件求值失败”和“int→double 提前返回失败”归因于运行中修改软件断点，并在 add/remove 外包裹 Stop/Continue。这只证明了一个绕过方案有效，没有找出实际触发点。该结论不完整，暂停包装已经移除。

这次定位到的触发点是：**App 自动继续运行后，再调用 SetScriptCallbackFunction，LLDB 编译 Python callback 时初始化 lldb.frame，触发运行中的 GetSelectedFrame，重建出过期的帧缓存。下次真实命中时，条件与 callback 使用了该缓存。**

### 执行链路

1. 第一次命中时 callback 读取表达式或执行提前返回，随后返回 False，LLDB 自动继续。
2. 旧实现每注册一个断点，都会调用 `bp.SetScriptCallbackFunction(...)`。
3. LLDB 的 `SetBreakpointCommandCallbackFunction → GenerateBreakpointCommandCallbackData → GenerateFunction → ExportFunctionDefinitionToInterpreter → ExecuteMultipleLines → EnterSession` 会初始化脚本全局变量，其中包含 `lldb.frame = lldb.thread.GetSelectedFrame()`。注册 callback 因而不是纯粹保存函数名。
4. 本机实测：第一次注册时，运行中的 GetSelectedFrame 返回无效帧；第一次命中自动继续之后，第二次注册却返回一个有效的旧帧，尽管进程状态仍为 Running。
5. 公开源码解释了这个边界：公开 Resume 设置 run lock；callback 返回 False 的自动继续走 PrivateResume。SBThread.GetSelectedFrame 依赖 run lock 阻止运行时读栈。在本机自动继续后的路径中，这次保护没有阻止读栈。线程帧缓存通常在恢复前由 ShouldResume/ClearStackFrames 清空，但 callback 编译在恢复后又把它填入；ThreadGDBRemote.RefreshStateAfterStop 刷新寄存器，不负责再次清空这份帧列表。
6. 所以下次停止包中的 PC 是新方法，Python callback 的 SBFrame 却仍是上一轮重建的旧帧。条件在错误作用域解析，或 ReturnFromFrame 找不到有效上层帧。

第 3、5 步有 Swift LLVM 6.2 公开源码支持；第 4、6 步有本机调用跟踪和协议证据。未声称已经调试 Apple 二进制内部的私有 C++ 成员值；已通过单变量实验确认运行中隐式读栈是这两个复现用例的关键触发因素，而非仅从源码猜测。

### 直接跟踪证据

诊断时临时包装 Python `SBThread.GetSelectedFrame`，不修改其结果，只记录实际调用和 Python 调用栈。第二次注册记录为：

```text
SETTING CALLBACK 2 state=6
SELECTED state=6 stop=6 valid=True pc=10268d7c0
  ... embedded_interpreter.py → run_one_line → <input>
```

`state=6` 是 Running。`<input>` 来自 LLDB 的脚本全局初始化。这个调用并非我们的 on_breakpoint、HitContext 或业务表达式主动发起。

此前协议取证也显示：真实 double 停止 PC 为 `0x100aa5424`，而 callback 的帧 PC 是旧 int 调用位置 `0x100aa57c0`，仅有一帧。`No older frame to return to` 发生在返回值 ABI 写入之前。

### 单变量对照

| 实验 | 结果 | 说明 |
| --- | --- | --- |
| 原实现：int 命中后移除，再注册 double | 失败，No older frame | 原问题重现 |
| 同一断点连续两次 int 提前返回，中间不重新注册 | 通过 | 提前返回或自动继续本身不足以触发失败 |
| 保持旧注册、删除和 callback 逻辑，仅在诊断中让运行中的 GetSelectedFrame 返回空帧 | int→double 通过 | 无 Stop/Continue，无缓存刷新补丁 |
| 原实现：表达式采集后再注册原生条件 | 失败，price 未声明及 module map 诊断 | 另一个问题独立重现 |
| 同样只抑制运行中的 GetSelectedFrame | 条件用例通过 | 条件表达式与 SetCondition 完全未改 |
| attach 时配置共享 callback，后续复用 | int→double 通过 | 无 Python monkey patch，无 add/remove 暂停包装 |

诊断 monkey patch 已全部移除，不进入生产实现。其作用只是隔离因果，不能作为 SDK 修复方案。

## 2. 针对触发点的修复

使用 LLDB 自带的 `SBBreakpointName` 共享 callback 配置：

```python
# attach 原本就会暂停 App；在首次 resume 前配置一次。
callback = lldb.SBBreakpointName(self.target, "meu_code")
error = callback.SetScriptCallbackFunction(
    __name__ + ".on_breakpoint", lldb.SBStructuredData())
if error.Fail():
    raise RuntimeError(error.GetCString())

# 后续注册断点时，只复用已有配置。
if not bp.AddName("meu_code"):
    raise RuntimeError("Could not apply debugger callback")
```

Breakpoint name 是 LLDB 原生的共享配置，不是假断点，也不新增 Python 注册表。Target 持有该配置，随会话销毁。每个断点保留自己的位置、condition、ID、记录和 remove 生命周期；callback 仍直接处理命中。

这避免了运行期间重复编译 callback 及其隐式读栈。没有重写条件、刷新寄存器或扩大暂停范围；add/remove 不额外调用 Stop/Continue。LLDB 安装软件断点自身仍可能使用内部中断。

## 3. 卸载超时：自动 dispose 等待已经失效的 Host 消息通道

复现：安装 price=40 的 override，确认原生结果 45 → Host 直接 `sdkScript.unload()`。旧实现 15 秒超时，后续 disconnect 同样超时。

Frida 的卸载并非直接销毁 JS：

1. Host Script._do_close 建立关闭请求，并从 Session 路由移除脚本。
2. Agent ScriptInstance.close 调用并等待 `rpc.exports.dispose("unload")`。
3. 我们的 dispose 忽略 reason，调用 disposeDebugger，发送 Controller detach 请求并等待响应。
4. 这个依赖 Host 路由的请求已无法完成，dispose 不结束。
5. 卸载和 destroyed 通知必须等 dispose 结束；原本用于兜底 detach 的 destroyed 处理也因此不能执行。

这不是已证明的 LLDB detach 死锁。调试时卸载前 Script.pin/unpin 差值为 0；首个 worker detach 命令出现在卸载超时后 Host 的兜底清理阶段。

最终方案：移除 SDK 的 dispose 导出，不在脚本卸载回调中等待 Host RPC。Host 在 script.destroyed / session.detached 中关闭 LLDB；正常 disconnect 仍先关 LLDB 再卸载，重复关闭请求共用一个任务。Android 的断点资源由底层统一通过 Script.bindWeak 清理，与 iOS 的 Host 会话所有权分开。

真实验证不仅检查 closed：直接卸载成功、Host LLDB 关闭、重连后 PID 不变，原生结果由 45 恢复到 15，tail=1。Android 原有断连清理也通过，未改变其原生回调排空逻辑。

## 4. 尚未解决的独立问题

Swift Int 提前返回曾出现 LLDB 报成功、调用方收到错误整数的情况。该问题不等于 No older frame，不能因为 int→double 恢复就宣称整个返回类型矩阵通过。本轮不修改 Swift 返回 ABI。

## 5. 本轮证据

- 原实现 int→double 失败及完整 LLDB/GDB 日志：[report](../../artifacts/e2e/2026-11-20T07-22-05.557Z-ios-32721/report.json)，同目录 diagnostics/。
- 记录隐式 GetSelectedFrame 的失败运行：[report](../../artifacts/e2e/2026-11-20T07-24-05.472Z-ios-36118/report.json)，同目录 diagnostics/meu-root-frames.log。
- 同一断点重复提前返回，无重新注册：[report](../../artifacts/e2e/2026-11-20T07-22-45.265Z-ios-33213/report.json)。
- 仅抑制运行中读栈，int→double 通过：[report](../../artifacts/e2e/2026-11-20T07-24-42.669Z-ios-36611/report.json)。
- 原实现条件失败：[report](../../artifacts/e2e/2026-11-20T07-26-31.303Z-ios-38315/report.json)。
- 仅抑制运行中读栈，条件通过：[report](../../artifacts/e2e/2026-11-20T07-27-01.374Z-ios-38895/report.json)。
- 无诊断补丁、共享 callback 的 int→double：[report](../../artifacts/e2e/2026-11-20T07-25-56.673Z-ios-37712/report.json)。

- 最终实现：完整 debugger 基础回归 13 项通过：[report](../../artifacts/e2e/2026-11-20T07-27-35.610Z-ios-39494/report.json)。
- 最终实现：提前返回回归 8 项通过、Swift Int 1 项失败、1 项未运行；切换断点与连续返回均通过：[report](../../artifacts/e2e/2026-11-20T07-30-03.756Z-ios-40547/report.json)。

artifacts 为本机生成证据，不作为源代码提交。测试使用配置中的预构建 App，SDK 和 Host 使用当前源码。

## 6. 源码依据

- [ScriptInterpreterPython.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Plugins/ScriptInterpreter/Python/ScriptInterpreterPython.cpp)：callback 编译、EnterSession 与 lldb.frame 初始化。
- [Process.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Target/Process.cpp)：公开 Resume、PrivateResume、停止事件和自动继续。
- [SBThread.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/API/SBThread.cpp)：GetSelectedFrame 的 run lock 检查。
- [Thread.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Target/Thread.cpp)：ShouldResume、ClearStackFrames、ReturnFromFrame。
- [ThreadGDBRemote.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Plugins/Process/gdb-remote/ThreadGDBRemote.cpp)：停止后的寄存器刷新。
- [SBBreakpointName API](https://lldb.llvm.org/python_api/lldb.SBBreakpointName.html)：共享选项自动应用到添加该 name 的断点。
- [Frida Host Script._do_close](https://github.com/frida/frida-core/blob/17.16.4/src/frida.vala)、[Agent ScriptInstance.close](https://github.com/frida/frida-core/blob/17.16.4/lib/payload/script-engine.vala)：独立的卸载问题。
