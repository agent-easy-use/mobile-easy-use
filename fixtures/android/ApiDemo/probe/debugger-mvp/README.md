# ApiDemo debugger 新 API 回归

按当前 `sdk/android/index.d.ts` 调用，无旧 API 兼容分支。

```bash
# 仓库根目录；构建真实 SDK AAR、agent 和 App，安装并重启 ApiDemo。
fixtures/android/ApiDemo/probe/debugger-mvp/build.sh <adb-serial>
node fixtures/android/ApiDemo/probe/debugger-mvp/run.mjs <adb-serial>
```

默认回归验证：

- 各 JNI 类型的局部变量/参数覆盖和提前返回，以及实例字段的完整类型读写矩阵：业务实际返回值、消费值、tail/finally，不只检查 API 未报错。
- condition → observations → overrides → earlyReturn 顺序，get 按需读取；各阶段可选、仅 stack、仅命中元数据。
- breakpoint.argumentTypes 精确选择重载，缺失或错误签名拒绝注册；类名和 class wrapper 两种 target。
- 直接 observation 数据、独立 stack、统一 errors；控制成功没有额外结果字段，失败项不以 null 占位。
- 参数遮蔽字段、有效作用域、this 专用读取、继承私有字段、子类同名字段、字段/方法重名、字段写入与类型拒绝。
- 缺失变量表时 this 仍可读取，参数名无法解析时禁止回退到同名字段；保留行号表用于安装断点。
- String/Object/CharSequence 按声明类型读取；直接 JS string 与 Java String wrapper 的写回/提前返回分别验证接受和拒绝，保留 null、空串、中文、emoji 和 StringBuilder。
- 各数组类型直接以 JS 数组写入局部变量、参数、字段及提前返回；对象数组/多维数组快照按元素验证。
- 与普通 Frida 字段读写对照：声明类型成员视图、显式 cast、合法值、非法数组元素及 long number 转换。
- 基本数组下标修改影响 Java，对象数组的 JS 元素替换不自动写回；替换/嵌套/null 数组清理不释放用户对象，retain/clone 后仍可访问。
- 条件/观测/覆盖/返回失败，部分覆盖保留且继续提前返回；同次命中同时发生观测与覆盖错误仍执行 earlyReturn，覆盖回调先执行再校验写入目标；get 命中结束后过期，异步/生成器拒绝。
- 并发、重入、在途 stop、重复 stop、停止后不再收集及重新注册。

`no-locals.init.gradle` 在 Java 编译后仅移除 `DebuggerNoLocalsFixture.class` 中的变量表，保留字节码与行号；不会改变业务 App 或 SDK 的编译配置。可用 javap -l 确认。

结果写入 `artifacts/benchmarks/debugger-mvp/result.json`。失败也保留已采集的记录，runner 清理自身探针与端口转发，确认进程仍存活。

独立 [读取矩阵](../debugger-read-types/README.md) 与 [两种打包方式加载](../debugger-agent-loading/README.md) 已迁移到相同 API。历史通过记录不代表本版本通过；以内含时间戳的本轮结果为准。

2026-09-30 类型转换对齐后真机验收：HUAWEI JAD-AL50 / Android 12 / API 31 / arm64，149 组主回归通过。基于当前 SDK 重新构建安装，结果包含 Frida 字段赋值对照和引用清理证据。独立读取矩阵另验证 500 项观测。

内嵌 NUL 字符串不在测试范围内。此前两种 APK 打包方式的加载验证见加载回归目录，本轮没有重跑该安装矩阵。
