# Debugger 待真机验证事项

> 迁移说明：下文保留历史调查过程，其中 `test/` 下的桌面原生实验脚本已移除。当前回归入口改为双端 ApiDemo 模拟器 E2E，见 [迁移清单](testing/debugger-e2e-migration.md)。

记录日期：2026-10-19。

本文保留旧 debugger 文档 review 中仍有意义的验证事项。记录实验结论，不据此添加兼容实现。macOS 实进程验证不代表 iOS 真机通过。

## 1. iOS：`thread return` / `earlyReturn`

状态：macOS 已复现并定位不同失败原因，iOS 真机待验证；尚未形成通用修复方案。

### 当前实现与问题

`src/ios/debugger/values.py` 的 `HitContext.early_return()` 将原生表达式求值得到的 `SBValue` 直接传给 `SBThread.ReturnFromFrame()`。OC 无结果表达式传空 `SBValue`，Swift `()` 保持原值。

实测存在 **API 返回成功，但调用方收到错误值甚至崩溃** 的情况。不能只检查 `SBError.Success()`，必须继续运行并检查调用方实际结果。

实验环境：macOS arm64、Xcode 26.0（17A324）、Apple LLDB 1703.0.31.2、Swift 6.2。以下均为该环境的特定 fixture 结果，不代表所有函数或工具链版本。

### 已验证的边界

| 场景 | macOS 实验结果 |
| --- | --- |
| Swift Int / Double / Bool / Int64，原始 SBValue | 出现成功退栈但返回旧值或错误值；直接 CLI `thread return` 也能复现 |
| Swift 标量改为对应 C 类型的 SBValue | 部分 Double / Bool 成功；源码行断点处的部分 Int / Int64 仍失败 |
| OC 整数、浮点、BOOL | 测试方法返回值正确，不能据此认为所有断点位置都正确 |
| OC 对象、nil、NSString，源码行断点 | 部分方法把旧 self 恢复为返回值，调用方随后崩溃 |
| OC 对象，机器入口断点 | 测试用例可以返回正确对象；返回值所有权仍需单独处理 |
| OC 增加异步展开信息，原源码行断点 | 测试中的对象、nil、NSString 返回正确；结构体 NSRange 仍失败 |
| Swift 普通具体 class，显式所有权与 C 指针适配 | 原构建、原源码行断点下，已有对象和新建对象均返回正确；身份及最终释放检查通过 |
| Swift String / Optional 等直接返回 | 已有失败样例，尚未验证可靠通用路径 |
| Swift / OC Void | 测试可以提前返回，但跳过函数尾部的 defer / finally / 部分清理 |

### 三个独立问题

1. **返回值类型与 ABI。** LLDB arm64 返回值写入路径不完整支持所有 Swift SBValue 类型。某些类型未进入实际写入分支，仍返回成功。把 Swift 值转成 C 标量或指针只能解决其中一部分，不能泛化到 struct、Any、协议存在类型等。
2. **展开现场覆盖返回寄存器。** LLDB 先设置返回值，再复制调用方寄存器现场。某些由指令模拟推导的 unwind 规则把栈上的旧 x0（参数或 self）当作需要恢复的值，覆盖刚写入的返回值。只有规则实际包含相应恢复位置时才发生，并非 x0 必然恢复成 self。
3. **对象所有权与函数清理。** 返回正确地址还不够，必须符合该函数的返回所有权约定。强制退栈会跳过正常退出路径，不能承诺执行 ARC 清理、defer 或 finally。返回对象释放正确与原函数局部对象清理正确需要分别验证。

源码核对入口：[Thread.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Target/Thread.cpp)、[RegisterContext.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Target/RegisterContext.cpp)、[ABIMacOSX_arm64.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Plugins/ABI/AArch64/ABIMacOSX_arm64.cpp)、[EmulateInstructionARM64.cpp](https://github.com/swiftlang/llvm-project/blob/swift/release/6.2/lldb/source/Plugins/Instruction/ARM64/EmulateInstructionARM64.cpp)。这些开源实现与实验现象相符，不等同于取得 Apple 发布二进制的完整构建源码。

### 两条已验证的实验路径，尚未采用

**OC 编译参数：** 对包含目标方法的 App / framework target 添加 `-fasynchronous-unwind-tables`。macOS OC fixture 使用后，LLDB 选用 eh_frame CFI，原失败的对象返回用例通过。`-Wl,-no_compact_unwind` 不是该结果的必要条件，单独添加也不能解决问题。

该参数属于业务原生代码的编译配置，不是 Host 配置。它没有解决所有类型问题，也不能恢复被跳过的函数清理。Swift 的 `-Xcc -fasynchronous-unwind-tables` 等实验未解决全部标量失败。

Xcode 默认行为已单独核对：新建最小 iOS App，Xcode 26.0、Debug、arm64 Simulator，实际 Clang 命令为 `-funwind-tables=1`，未默认开启 `-fasynchronous-unwind-tables`；显式开启后为 `-funwind-tables=2`。这不是 iPhoneOS 真机构建结果，也不外推所有 Xcode 版本。未发现可据以认定 Xcode 自动规避这些问题的证据。

**Swift 具体 class：** 实验先求值，再将指针数据表示成 Clang `void *`：

```python
value = context.evaluate('Unmanaged.passRetained(candidate!).toOpaque()')
pointer = target.CreateValueFromData(
    'returned', value.GetData(),
    target.GetBasicType(lldb.eBasicTypeVoid).GetPointerType())
error = thread.ReturnFromFrame(context.frame(), pointer)
```

同样验证了新对象 `Unmanaged.passRetained(Model(400)).toOpaque()`。这两个具体 class 用例无需新增编译参数或手动写寄存器，调用方对象身份、deinit 和 weak 引用检查通过。此实验不构成任意 Swift 类型的返回协议；也不能把 `passRetained` 无条件用于所有返回类型。

OC 所有权也需区分：测试中的 `newModel` 属于返回 +1 对象的方法族，直接返回已有 candidate 会导致后续过度释放；显式提供相应所有权后通过。不能对所有 OC 对象统一 retain。

### 真机验证清单

- 记录设备、iOS、架构、Xcode / LLDB 版本，以及目标方法所在产物的实际编译参数和 UUID。
- 对比机器入口与方法内源码行断点；保留正常执行、仅表达式求值、强制返回三组对照。
- Swift：Int、Int64、Double、Bool、Void、普通 class（已有 / 新建对象），以及 String、Optional、struct 的能力边界。
- OC：标量、Void、对象 / nil / NSString、普通返回与 +1 方法族、结构体。
- 对比原始 SBValue 与上述有限适配路径；OC 对比默认构建与异步展开信息构建。
- 失败时记录表达式结果类型、实际采用的 unwind 规则、返回前后寄存器、调用方实际结果及停止原因。
- 对象同时检查身份、业务访问、释放后 weak / deinit；另外检查原函数局部对象和 defer / finally，避免把返回对象正常释放误认为全部清理正常。

验收依据是调用方实际收到正确结果、后续访问及所有权检查通过；单纯“没有报错”或“没有立即崩溃”不算通过。生产实现暂时保持不变，不加入手动寄存器补偿或统一 retain。

本轮本地实验材料在 `/tmp/meu-return-validation/`，Xcode 默认参数检查在 `/tmp/meu-xcode-unwind/`，均为临时材料，不保证长期保留。仓库现有入口 `test/ios_debugger_lldb_test.py` 仅覆盖部分直接 SBValue 用例，不包含这里的完整矩阵。

## 2. Android：原生未知类型错误分支

状态：实现已完成，缺少原生分支验证，不是已知功能缺失。

- `debugger.cpp` 的局部变量 / 字段读写和提前返回，未知类型已返回 `JVMTI_ERROR_ILLEGAL_ARGUMENT`。
- JS 非法描述符测试不能证明进入过这些 C++ 分支；合法 JVM 元数据及 JS 预校验通常会阻止正常 API 触达这些分支。
- 后续通过受控原生故障注入，检查各分支明确报错，不按 int 读写或返回。不能把普通真机回归通过记作该防御分支已覆盖。

## 3. Android：最新类型转换与两种 APK 打包方式交叉验证

状态：各自有通过记录，最新实现缺少完整交叉覆盖。

- 2026-09-29：Huawei JAD-AL50 / Android 12，两种模式均完成 2 轮生命周期、6 次命中，分别通过 136 组主回归。
- 2026-09-30：Frida 类型转换调整后，同设备通过 149 组主回归及 500 项读取观测；当轮没有重跑两种打包模式。
- 待补：对当前实现分别使用 `useLegacyPackaging=true`（解压 so）与 `false`（APK 内加载 so），覆盖对象 / 数组读写和提前返回、引用清理、重复 attach / detach。记录实际模块加载路径，不能只验证标量命中。

ApiDemo 使用 AGP 默认原生库打包配置；不再维护两种打包方式的独立常态测试，调试器加载与卸载重用由 `tests/common/debugger` 的 E2E 验证。变量读取矩阵已迁入 `fixtures/android/ApiDemo/tests/inspect/code-read-types.js`，通过 `node test/e2e/run.mjs --platform android --suite inspect/code-read-types` 执行。

## 4. 本轮暂不推进的事项

- 按已有决定，忽略 Android suspend 恢复点和内嵌 NUL 字符串专项；不代表问题已修复。
- iOS 完整真机链路后续再做，包括符号自动发现、Host config 中的 dSYM 加载、行表、运行时快照、原生条件错误及会话清理。
- attach / detach 是否改为自动生命周期仍是产品 API 决策，当前保留显式 API，不属于本轮验证修复。
- 旧文档中的 invokeJSRun、publishObservation、Frida 原生桥转换和配套 Swift 模块方案已被新方案移除，不再作为待实施事项。跨机器源码自动映射未纳入当前“本地构建、源码未搬迁”的范围。

## 5. ApiDemo 默认构建的模拟器验证

2026-10-19，ApiDemo / Xcode 26.0 / iPhone 17 模拟器（iOS 26.0.1、arm64）：

使用默认 ProbeDebug 构建，不需要设置 `ENABLE_DEBUG_DYLIB` 或覆盖
`DEBUG_INFORMATION_FORMAT`，也不需要为本机构建配置 dSYM。实际产物采用
Xcode debug dylib 布局，LLDB 自动发现本机调试信息。

28 个真实 App 用例执行完成：25 通过、3 失败、0 未执行。失败为 Swift 直接标量返回、
修改变量后返回、override 报错后返回；预期 42 / 25 / 42，实际均为错误大整数。
本次没有修复其 ABI 返回问题，也没有将已知失败降级为跳过。
OC 用例、Swift 观测/修改/条件、双端 Void、地址断点和生命周期验证通过，不外推真机。
旧 `Probe.debugger` 夹具已移除；当前设计见 `docs/runtime-api-design/inspect-code-ios.md`。
结果：`artifacts/benchmarks/ios-debugger/default-layout-config-result.json`。

同轮验证了 Host config：临时移走全部 13 个 `.o` 后，通过 `dsymPaths` 中的
匹配 dSYM 通过 OC/Swift 源码断点观测用例；缺失、UUID 不匹配、重复路径的错误
按顺序返回，不阻止后续正确项。只配置失败路径时 attach 和地址断点仍通过。
临时移走的 `.o` 已全部恢复。证据位于 `artifacts/benchmarks/ios-debugger/ci-*-result.json`。

历史上曾因主 executable 行表前置检查而阻断默认布局，并用关闭 debug dylib 的构建
进行补测。该前置检查已移除，默认布局已完成上述回归，不再需要补测构建参数。
历史失败记录 `default-build-result.json` 仅用于对照，不代表当前实现状态。
