# override — API 说明

[返回总览](README.md) · [Android](override-android.md) · [iOS](override-ios.md)

本文描述双端 `sdk/{platform}/override` 的公开 API。完整类型声明见对应平台 `index.d.ts`；平台文档中的 API 签名为说明记法。

## 1. 作用与 API

在探查或测试期间修改 App 的方法行为、字段值或执行现场。安装返回 remove 闭包，由调用方显式调用以撤销覆盖。

| API | 作用 | 当前返回 |
| --- | --- | --- |
| `override.method(definition, returnInstead)` | 替换方法执行，匹配参数条件时直接返回指定值 | `Promise<Remove>` |
| `override.field(definition, value)` | 保存旧值并设置一次 | `Promise<Remove>` |
| `override.code(definition, overrides?, earlyReturn?)` | 在代码位置修改变量，可提前返回 | `Promise<Remove>` |

三个 API 都直接接收干预内容，不使用 options 包装。字段写入不锁定字段，App 仍然可以修改它。code 命中前的代码已经执行，与替换整个方法不同。

### 平台差异

| 项目 | Android | iOS |
| --- | --- | --- |
| method 定位 | 类名、方法名、参数类型 | 类名、带 `+`／`-` 的 selector |
| method 参数与返回值 | Java bridge 高层转换，boolean 使用 true／false | NativeCallback ABI 值，不经过 OC 高层转换；BOOL 使用 0／1，对象参数为 NativePointer |
| method 重复安装 | 所选方法已有 implementation 时报错 | 允许；调用方负责逆序移除 |
| field 定位 | className／instance 二选一，分别用于静态／实例字段 | instance＋property，通过属性 getter／setter 读写 |
| code 定位 | 类名、方法、参数类型、源码行号 | 源码文件及行号，或执行地址 |
| code 条件 | `({ get }) => boolean` | 原生表达式字符串 |
| code 覆盖值／提前返回值 | 直接值或同步函数 | 原生表达式字符串 |
| code 返回空引用 | `null` | Objective-C 使用 `'(id)nil'` |

method 双端均使用 className 指定类名。实例方法覆盖作用于所有派发到该方法实现的调用，不提供实例筛选。filter 位于 definition，只筛选原方法参数；filter 和动态 returnInstead 按参数顺序接收参数，不接收 `{ args, receiver }`。

method 的回调在安装时检查函数类型，调用时直接执行。调用方负责同步返回合法值，SDK 不额外检测返回值是否为 Promise。

method 与 code 独立，不互相检查或占用资源；方法替换后若不执行原方法，其内部断点可能不再命中。

## 2. code 执行语义

```text
命中位置 → condition → overrides → earlyReturn → 恢复执行
```

- 不传 condition：每次命中均干预。条件不满足：跳过本次干预。条件求值失败：记录 condition 错误并跳过本次干预。
- 至少提供一个 overrides 项，或一个非 undefined 的 earlyReturn。
- overrides 各项不承诺依赖顺序。earlyReturn 在覆盖阶段之后求值，可读取成功写入后的值。
- 普通单项覆盖失败时记录错误，继续后续项和 earlyReturn；已写入的值不回滚。执行现场不安全等错误可能终止后续操作或调试会话。
- 不传 earlyReturn 或传 undefined：不提前返回。Android 的 null 表示空引用；iOS 不接受 JS null。具体值必须符合原方法返回类型。
- 提前返回会跳过方法剩余执行路径，不能依赖被跳过的 finally/defer 等清理逻辑。

各平台的定位限制、表达式规则及 void 返回方式见对应文档。

## 3. 返回与移除

```typescript
type Remove = () => Promise<void>;
```

method／field／code 统一异步返回异步清理闭包。安装和移除都必须 await；安装失败或清理失败时拒绝 Promise，清理成功时不返回数据。异步接口不代表切换线程，也不改变 method 的 filter／returnInstead 必须同步执行的约束。没有句柄对象、资源 ID 或清理结果对象。

```javascript
const remove = await override.method(definition, returnInstead);
try {
  await exploreApp(); // 调用方提供的探查逻辑
} finally {
  await remove();
}
```

| 覆盖类型 | remove 的效果 |
| --- | --- |
| Android method | 将 implementation 设为 null；若其已被外部替换则报错 |
| iOS method | 直接恢复本次安装前保存的 IMP；调用方保证逆序移除，不校验顺序 |
| field | Android 写回旧字段值；iOS 调用 setter 设置保存的 getter 返回值；释放引用，可能覆盖 App 期间的新值，iOS setter 副作用不撤销 |
| code | 停止未来干预，完成必要收尾并释放资源，不撤销已发生的修改 |

method/field 的移除闭包通过局部标记避免重复清理。code 的并发清理与失败重试按各平台实现处理；调用方应始终 await remove，不依赖重复调用修复失败。SDK 不集中登记覆盖，也不提供批量 dispose；调用方负责保存闭包并清理。移除不等于回滚整个业务状态。

## 4. 错误与证据

三个 API 的安装错误统一通过返回的 Promise 拒绝传播。安装成功只表示覆盖已注册，不代表后续每次干预都会成功。

| 事件 | 时机与内容 |
| --- | --- |
| `override.callback_error` | method 的 filter／返回值计算抛错时报告，包含方法定位信息（className 及 method／selector）、phase、message；随后调用被覆盖前的实现 |
| `override.code` | code 移除时发出命中记录，包含 location、records；记录中保留 condition、overrides、earlyReturn 等阶段的错误 |

原生返回类型转换失败不属于 JS 回调异常回退的保证范围。override 不提供 current；上述事件是运行时诊断日志，不会由 MCP 聚合为 evidence 文件，也不自动进入脚本 result。remove 只表示清理完成，不返回命中记录；需要可返回的观测数据时使用 inspect。

iOS code 按需自动 attach debugger，脚本销毁或断连时由 Host 兜底 detach。未来 CLI 的资源标识不属于当前 API；示例中的业务类、对象和源码路径需替换为目标 App 的实际值。
