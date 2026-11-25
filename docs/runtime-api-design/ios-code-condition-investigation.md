# iOS 同位置条件断点分发调查

> 迁移说明：下文保留历史调查过程，其中 `test/` 下的桌面原生实验脚本已移除。当前回归入口改为双端 ApiDemo 模拟器 E2E，见 [迁移清单](../testing/debugger-e2e-migration.md)。

状态：历史调查记录。以下记录切换 callback 前的问题定位；当前实现已使用 LLDB callback 分发并保留 SetCondition，现行契约见 [inspect.code iOS](inspect-code-ios.md)。

## 复现与观察

环境：Apple LLDB `lldb-1703.0.31.2`，Apple Swift 6.2，macOS ARM64。

同一行安装 A、B：

- A：`(++evaluated_a, value == 100)`。
- B：`(++evaluated_b, value < 0)`。
- App 先以 100，再以 200 调用该位置。

首次停止的真实输出：

```json
{"reason":[1,1,2,1],"callbacks":[],"value":"100","hitCounts":[1,0],"evaluated":["1","1"]}
```

reason 按 `[breakpointId, locationId]` 成对排列，因此包含 A 的 1.1 和 B 的 2.1。但 B 的 hit count 是 0，两个条件各执行一次。这说明 SetCondition 生效，问题不在条件判断。

为两个断点分别设置只记录标识并返回 true 的脚本 callback 后：

```json
{"reason":[1,1,2,1],"callbacks":[[26987548,1,1]],"value":"100","hitCounts":[1,0],"evaluated":["1","1"]}
```

只有 A 的 callback 执行；条件仍各求值一次。第二次 value=200 时没有对外停止。

## 原因

worker 目前从 GetStopReasonDataAtIndex 中提取所有 breakpoint ID，并对每个注册执行 hit。当前 LLDB 在这个场景返回的是共享断点位置关联的 ID，不能把每个 ID 都当成条件成立的命中。

LLVM 的 StopInfo 源码也包含“返回断点位置的全部 constituents”的路径，但不同版本实现有变化；以上判断以本机复现为依据，不泛化为所有 LLDB 版本都具有相同表现。

参考：[LLVM StopInfo.cpp](https://lldb.llvm.org/cpp_reference/StopInfo_8cpp_source.html)。

## 初始修复方向（已被直接 callback 方案替代）

保留 SetCondition，不重新执行条件。使用 LLDB 条件成立后触发的 breakpoint callback 标记实际命中的线程／断点／位置，worker 据此分发；条件求值失败仍使用诊断事件报告。

callback 只标记，不在其中执行 capture／override。需要继续验证多线程、多个位置、条件错误和表达式内部执行的事件边界。

GetHitCount 的差值也能识别本例，但计数是聚合值，不足以直接确定多个线程分别命中了哪个条件，因此未采用计数作为通用修复。

## 运行最小复现

在仓库根目录：

```bash
xcrun clang -g -O0 test/fixtures/ios-debugger-conditions.c -o /tmp/meu-condition-check
MEU_CONDITION_BINARY=/tmp/meu-condition-check xcrun lldb --batch \
  -o 'command script import test/ios_debugger_conditions_lldb.py' \
  -o 'version' \
  -o 'check-conditions' \
  -o 'check-conditions callbacks'
```

本复现不依赖 SDK、Frida 或 Host worker，用于隔离 LLDB 自身的停止原因与条件 callback 行为。

## callback 直接承接 hit 的验证

验证直接调用现有 `Session.hit`，没有重新实现表达式求值／赋值／提前返回，也没有修改生产 worker 的分发方式。

环境同上。使用 Swift 函数与 Objective-C 类方法分别验证；callback 返回 False，由 LLDB 继续运行。普通捕获与覆盖同时验证了同步、异步调试模式。

| 能力 | callback 内实测 | 停止后路径对照 |
| --- | --- | --- |
| Swift 参数／局部变量、字符串快照、调用函数的表达式 | 通过 | 已有宿主验证通过 |
| OC 局部变量、NSString、`[title length]` 求值 | 通过 | 已有宿主验证通过 |
| stack、单项表达式失败后保留成功字段 | 通过 | 已有宿主验证通过 |
| 修改局部变量，并由业务最终结果断言 | Swift／OC 均通过 | 已有宿主验证通过 |
| 同位置 A 成立、B 不成立 | 只有 A 的 callback 执行并生成记录 | 原 ID 列表分发会误采集 B |
| OC 方法 int／double／BOOL 提前返回 | 实际结果为 200／3.5／0 | 相同结果 |
| OC 方法 long long 提前返回 | 错误，实际 4295000296，预期 LLONG_MAX | 同样错误 |
| OC 方法对象提前返回 | 错误，结果为类对象地址，而非指定 NSString | 同样错误 |
| Swift Int 提前返回 | 错误，实际 6171915536，预期 200 | 原有独立 earlyReturn 验证同样错误 |

之前先用 C 函数（编译在 .m 文件中）验证，对象提前返回成功；改为真实 OC 方法后发现对象返回失败。因此不能把 C 函数结果推广到 OC 方法。以上数值是本次进程观测结果，不是跨进程固定值。

结论：callback 直接承接普通采集和覆盖可行，未发现这些能力因 callback 执行阶段产生额外限制。已有 earlyReturn 路径存在独立的类型／返回值问题；本次只隔离问题，不修复或承诺完整 earlyReturn 支持。安全失败时的会话结束、多线程／多位置及多个覆盖的相互作用仍需在正式迁移时验证。

复现：

```bash
xcrun swiftc -g -Onone test/fixtures/ios-debugger.swift -o /tmp/meu-callback-swift
MEU_DEBUGGER_TEST_BINARY=/tmp/meu-callback-swift xcrun lldb --batch \
  -o 'command script import test/ios_debugger_callback_lldb.py' \
  -o 'meu-callback-test capture' \
  -o 'meu-callback-test capture-async' \
  -o 'meu-callback-test return'

xcrun clang -g -O0 -fobjc-arc -framework Foundation \
  test/fixtures/ios-debugger-callback.m -o /tmp/meu-callback-objc
MEU_DEBUGGER_TEST_BINARY=/tmp/meu-callback-objc xcrun lldb --batch \
  -o 'command script import test/ios_debugger_callback_lldb.py' \
  -o 'meu-callback-test objc-capture-async' \
  -o 'meu-callback-test objc-return' \
  -o 'meu-callback-test objc-return-baseline'
```

return 用例当前预期出现业务断言失败，用于记录并对照已有问题。LLDB Python 命令的断言失败未必使 LLDB 进程返回非零，判断应查看 PASS／Traceback 及业务断言输出，不能只看 shell exit code。


## 生产 worker 迁移

worker 已改为在注册断点时安装 callback，保留 SetCondition。callback 使用现有 by_breakpoint 找到注册，直接执行 Session.hit，正常返回 False；事件循环不再按停止原因中的断点 ID 分发采集，仍处理条件诊断和进程异常。

不安全的采集或 callback 异常通过 pending_end 留下结束原因，callback 返回 True 保持停止，外层循环执行 detach，避免在 callback 内销毁当前调试会话。

涉及覆盖的已解析地址重叠改为注册时拒绝；纯观测允许同地址多注册。不引入额外的命中登记表。earlyReturn 已知错误仍单独保留，未在本次迁移中修复。


迁移验证补充：独立 debugger 需要在其 Python namespace 中导入 worker 后才能按名称绑定 callback。条件求值失败也可能触发 callback；worker 通过独立 diagnostic listener 读取 LLDB 已产生的错误，在采集或覆盖前跳过该次命中，不重新计算条件，也不消费 process stop 事件。此行为与 [LLDB StopInfo 实现](https://lldb.llvm.org/cpp_reference/StopInfo_8cpp_source.html) 相符。

完整 Frida → Host → LLDB 宿主验证已覆盖同地址两个条件成立 watcher、条件不成立 watcher、条件求值错误 watcher，以及 current、stop、脚本卸载 detach。多线程、多位置和 iOS 真机仍需额外验证。
