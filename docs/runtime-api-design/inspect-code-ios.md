# inspect.code — iOS MVP API 设计

[返回 inspect](inspect.md) · [返回总览](README.md) · [Android 设计](inpsect-code-android.md)

状态：iOS inspect.code 已实现并接入根导出与类型声明，复用 Host LLDB。断点由 callback 采集，保留原生 SetCondition；平台限制和生命周期见下文。实际设备覆盖以 tests/inspect、tests/common 和运行报告为准。

## 1. 作用与 API

观察 App 执行到指定代码位置时的现场，帮助 Agent 确认路径是否执行、读取局部变量、验证表达式和追溯调用来源。每次符合条件的命中生成一条记录；不提供 method 的 enter／leave、方法返回状态或耗时。

```typescript
type JsonValue = null | boolean | number | string
  | JsonValue[] | { [key: string]: JsonValue };

type IOSCodeDefinition =
  | { kind: 'source'; file: string; line: number; condition?: string }
  | { kind: 'address'; address: string; condition?: string };

interface IOSCodeOptions {
  capture?: Record<string, string>; // 输出字段名 → 原生表达式
  stack?: number; // 0 或省略不采集，1～256 指定最多帧数
}

interface IOSCodeFrame {
  function: string | null;
  module: string | null;
  sourceFile: string | null;
  line: number | null;
}

interface IOSCodeRecord {
  hitId: string; // watcher 内唯一
  timestamp: string; // Host 开始采集时的 ISO 8601 UTC 时间
  threadId: number;
  threadName: string | null;
  capture?: Record<string, JsonValue>;
  stack?: IOSCodeFrame[];
}

type CodeResult =
  | { ok: true; data: IOSCodeRecord[]; error: null }
  | { ok: false; data: IOSCodeRecord[]; error: string };

interface CodeWatcher {
  current(): Promise<CodeResult>;
  stop(): Promise<CodeResult>;
}

// API 签名记法
inspect.code.watch(
  definition: IOSCodeDefinition,
  options?: IOSCodeOptions,
): Promise<CodeWatcher>;
```

- watch／current／stop 全部异步。watch 成功返回时观测已安装。
- watcher 只有 current、stop，不暴露 id 或 registry。Host 协议可使用内部注册标识。
- definition 决定在哪里、什么条件下观测；options 决定命中后采集什么。
- 配置和记录中都使用 capture；不使用 observations。
- 外层结果始终包含 ok、data、error；error 成功为 null，失败为字符串，不含 error.code。
- 不依赖 action，不自动写证据文件；未来 CLI 的 watcher 管理由控制端负责。

## 2. definition：位置与条件

### 源码位置

```javascript
{
  kind: 'source',
  file: '/Users/me/project/SearchService.m',
  line: 42,
  condition: 'useCache && cached != nil',
}
```

沿用当前 LLDB 后端定位规则：

- file 是 Host 上存在的源码文件绝对路径，line 为正整数。
- 通过调试信息解析可执行位置；找不到已解析位置时安装失败。
- 一个源码位置可能解析为多个机器码位置，不承诺一个 watcher 只对应一个地址。
- 停在某行不表示整行已经执行完。读取赋值结果时，应选择赋值完成且变量仍可访问的位置。
- 编译优化、符号缺失或变量作用域会影响可读性；命中位置不代表所有变量都可读。

### 加载地址

```javascript
{ kind: 'address', address: '0x104012340' }
```

address 是当前进程中的十六进制加载地址，需位于已加载镜像。地址可能随进程重启变化；没有调试信息时，地址断点不自动提供变量名解析能力。

MVP 不新增模块偏移、类名／方法名或 selector 定位。definition 的 file／address 保持现有定位字段；栈帧中的 sourceFile 命名与其无关。

### condition

condition 是当前位置语言的原生表达式字符串，通过 LLDB breakpoint.SetCondition 设置，不是 JS 函数。Host 命中处理不重复求值。条件成立后由 LLDB callback 直接采集，不再按停止原因中的关联断点 ID 分发，详见 [条件断点调查](ios-code-condition-investigation.md)。

```text
位置命中 → LLDB 判断 condition → 条件成立 → 创建 record → stack／capture
```

- 未提供时接收所有命中。
- 不成立时不创建 record、不分配 hitId、不占用记录容量。
- 条件求值失败仅设置外层 error，不生成记录，也不继续 capture。
- 条件由 LLDB 求值，Host 不再次执行，避免重复副作用。
- 表达式应使用当前位置支持的 OC／Swift／C／C++ 语法，语言和类型解析由 LLDB 负责。

## 3. capture：具名原生表达式

```javascript
{
  capture: {
    normalized: 'normalized',
    cacheHit: 'cached != nil',
    title: 'cached.title',
    queryLength: '[normalized length]',
  },
  stack: 8,
}
```

capture 是具名采集项映射。每个 key 是输出字段名，每个 value 都是原生表达式字符串。读取变量就是最简单的表达式，不另分变量名或表达式两种模式。

| Agent 想观察什么 | 示例 |
| --- | --- |
| 参数／局部变量 | `count`、`query` |
| 当前接收对象 | `self` |
| 字段／属性 | `cached.title` |
| 条件是否成立 | `cached != nil` |
| 计算值 | `count * 2` |
| 方法调用结果 | `[normalized length]` |

Swift 示例：

```javascript
{
  capture: {
    query: 'query',
    itemCount: 'items.count',
    hasSelection: 'selectedItem != nil',
  },
}
```

- 表达式在命中的当前帧求值，不提供选择其他栈帧的 API。
- 不接收 JS 采集函数，不提供 Android 的 { get }。
- 字符串不是直接保存的字面量。例如要产生 OC 字符串，应填写对应原生表达式，如 `'@"cache-path"'`。
- 未配置 capture 时省略结果中的 capture；配置 {} 时结果为 {}。
- 不默认枚举全部变量，不递归展开原生对象。
- 各采集项依次求值；普通单项失败省略该字段，仍尝试其他采集项。不要让字段之间依赖副作用。

属性访问可能执行 getter，表达式也可调用业务方法。副作用不会回滚，不能将此能力理解成无副作用的变量读取器。

当前表达式执行配置保持其他线程停止、不遇到内部断点就嵌套采集，并设置目标表达式执行超时。依赖其他线程完成的调用可能超时；该超时不代表整个编译／符号查找请求有相同时间上限。若原命中帧无法安全恢复，停止后续采集并沿用后端终止调试会话的处理，不继续读取失效现场。

## 4. capture 结果与类型转换

```text
原生表达式 → LLDB SBValue → Host 快照转换 → JSON 传输 → capture Record
```

外层是 Record，字段值受 JSON 传输限制。与 Android 不同，iOS 不能直接返回 Frida wrapper、SBValue 或可调用的原生引用。

沿用当前快照转换能力：

| 原生求值结果 | 返回值 |
| --- | --- |
| BOOL／Bool | boolean |
| JS 安全整数范围内的整数 | number |
| 超出安全整数范围的整数 | 十进制字符串 |
| 有限浮点数 | number |
| 非有限浮点数 | 字符串 |
| NSString／Swift String | 字符串 |
| nil 对象／空 Swift Optional | null |
| 非空 Swift Optional | 对解包后的值生成快照 |
| void／成功执行但无结果 | null |
| 其他对象、结构体等 | LLDB 摘要或值的展示文本 |

JsonValue 表示允许传输的类型范围，不承诺任意原生对象或数组都能自动展开成 JSON 对象／数组。当前复杂对象通常返回文本；不自动调用 description／po。快照转换本身可能执行获取字符串等必要的原生操作，不能视为纯文本格式化。

```javascript
capture: {
  cached: 'cached',     // 可能得到对象展示文本
  title: 'cached.title', // 明确提取需要判断的属性
}
```

- 对象文本中出现地址不表示持有该对象；不向调用方提供 retain／release 生命周期。
- 结果是命中时生成的快照，App 后续修改对象不会修改已有记录。
- 保留当前后端单项文本／字符串 64 KiB 限制，超限作为该采集项失败。
- 变量不可读或求值失败不是 null：省略失败字段，外层 error 说明原因。

## 5. stack 与 CodeFrame

stack 与 capture 同级。省略或 0 不采集；1～256 指定最多采集帧数，沿用当前后端范围。

```javascript
{
  function: '-[SearchService search:]',
  module: 'MyApp',
  sourceFile: '/Users/me/project/SearchService.m',
  line: 42,
}
```

- 数组从当前命中帧开始向调用方排列，不增加 index。
- 不返回栈帧 address。
- 文件字段统一为 sourceFile；通常来自调试信息中的源码路径。
- function 是 OC／Swift／C／C++ 符号名称，不强行拆成 className 与 methodName。
- 不可用的符号、模块、文件或行号为 null。
- 不保证重建 Swift 异步任务的完整因果链。

Android 的 CodeFrame 保留 className、methodName、sourceFile、line；两端保留各自有意义的函数信息，不强制完全相同。

## 6. 记录、错误与容量

不提供 options 时：

```javascript
{
  hitId: 'h1',
  timestamp: '2026-11-05T08:00:00.000Z',
  threadId: 1234,
  threadName: 'main',
}
```

- timestamp 是 Host 开始采集的时间，不保证等于底层断点触发的精确时刻。
- 采集结束后才追加记录，按完成顺序返回，不维护公开 complete 状态。
- 不包含 enter／leave、durationMs、方法返回状态或记录级 errors。
- 零命中是成功：`{ ok: true, data: [], error: null }`。

只记录首个错误到外层 error，后续成功不清除该错误；已有成功数据保留：

```javascript
{
  ok: false,
  data: [{
    hitId: 'h1',
    timestamp: '2026-11-05T08:00:00.000Z',
    threadId: 1234,
    threadName: 'main',
    capture: { count: 3 },
  }],
  error: 'capture title, hit h1: Variable is unavailable',
}
```

- watch 安装失败拒绝 Promise，不返回不可用 watcher。
- capture 或 stack 普通错误不丢弃其他成功证据。
- 条件错误、会话结束或框架错误可只有外层错误而没有新记录。
- 每个 watcher 最多保存 10,000 条记录；超限拒绝新增采集并报告错误，不自动注销断点。
- 记录条数上限不是总字节预算。调用方应提取必要信息，避免大量重复的大文本。

## 7. current／stop

### current

获取 Host 已完成采集的累计记录，不清空、不重新求值、不等待下一次命中，也不主动暂停 App。

需要一次 SDK → Host 请求及 JSON 序列化／传输，成本随累计数据量增长。Host worker 正在执行采集或表达式时，请求可能排队；current 不是本地零成本 getter。

每次返回独立的 JSON 数据快照；SDK 如缓存结果，也必须避免调用方修改影响后续结果。MVP 不引入分页或增量游标。

### stop

删除当前 watcher 的断点，返回最终累计记录。只影响自身注册，不 detach 共享会话，不停止其他 watcher／override。

- 已经由 worker 开始执行的采集完成后，才能处理排队的 stop 请求。
- Host 不额外执行 Stop/Continue 包装注册／删除。首次 attach 的暂停阶段通过 SBBreakpointName 配置一次 Python callback，后续断点通过 AddName 复用，避免运行中重复编译 callback 时隐式读取并缓存过期栈帧。LLDB 安装软件断点自身仍可能短暂中断进程。
- stop 开始后 current 返回失败、data 为 []，最终记录通过 stop 获取。
- 并发 stop 共用一次停止操作；成功后重复 stop 返回最终结果的独立快照，不重复 remove。
- 删除失败返回错误并允许重试；不能把删除失败报告成已停止。
- 请求或传输失败时返回仍可取得的数据；没有可用数据则为 []。会话结束后是否还能取回记录取决于 Host 缓存是否仍在，不能伪造成功或空的完整结果。

## 8. debugger 会话生命周期

采用按需共享会话的方向：

```text
首次 inspect.code.watch／override.code → attach
后续注册 → 复用 debugger 会话
单个 stop／remove → 仅移除自身断点
脚本卸载 → detach 共享会话
```

- 同时首次调用共用一次 attach 请求，不重复 attach。
- SDK 不导出 `dispose`，也不在 `Script.bindWeak` 中请求 Host。Host 的脚本销毁／断连通知负责兜底 detach；正常断开仍先关闭 LLDB，再卸载脚本，避免暂停中的 App 阻塞卸载。
- watcher 与 override 可共享会话；不意味着同一位置的读写执行顺序已经定义。
- 所有注册移除后不自动 detach，避免频繁 attach／detach。
- 卸载开始后不接受新注册。
- attach 失败不得继续安装断点；重试与会话失败恢复需要在公共会话层处理。

新 inspect.code 与 override.code 已共用按需 attach。Host 监听 Frida Script.destroyed 事件，在脚本卸载后完成 detach，不依赖 bindWeak 发消息或等待 RPC 回包。Host 连接关闭／断开清理继续作为兜底。probe.debugger 旧入口已移除。

## 9. 使用示例

以下类、变量、文件及行号为业务示例；watch 自动管理共享会话。

### Objective-C 现场与断言

```javascript
const watcher = await inspect.code.watch(
  {
    kind: 'source',
    file: '/Users/me/project/SearchService.m',
    line: 42,
    condition: 'useCache',
  },
  {
    capture: {
      query: 'normalized',
      cacheHit: 'cached != nil',
      title: 'cached.title',
    },
    stack: 8,
  },
);

let result;
try {
  // 在此通过 drive 触发搜索，并等待目标业务场景完成。
  const progress = await watcher.current();
  // progress 是累计快照；可在继续驱动 App 后再次读取。
} finally {
  result = await watcher.stop();
}

if (!result.ok) throw new Error(result.error);
if (!result.data.some(record => record.capture.cacheHit === true)) {
  throw new Error('Expected a cache hit');
}
```

### Swift 变量与表达式

```javascript
const watcher = await inspect.code.watch(
  { kind: 'source', file: '/Users/me/project/SearchService.swift', line: 58 },
  {
    capture: {
      query: 'query',
      itemCount: 'items.count',
      hasSelection: 'selectedItem != nil',
    },
  },
);
// 驱动 App 后：
const result = await watcher.stop();
```

### 仅确认代码位置命中

```javascript
const watcher = await inspect.code.watch({
  kind: 'address',
  address: '0x104012340',
});
// 驱动 App 后：
const result = await watcher.stop();
// result.data 只有命中元数据，不包含 capture／stack。
```

## 10. 实现范围与旧 API

inspect.code 与 override.code 共用现有 worker 的统一命中处理：condition → stack／capture → overrides → earlyReturn。现有字段直接改为新结构，不增加 inspect 专用 Host 分支或映射层。iOS snapshot 是跨进程传输的必要步骤，不沿用 Android 保存原生 wrapper 的方式。

本轮已实现：

- sdk/ios/inspect/code.js：配置、watcher、current／stop 及最终结果处理。
- Host 非破坏性读取记录的请求，支持 current。
- 无 capture／stack 时允许仅记录命中。
- 新记录格式：capture、ISO 时间、threadId／threadName；stack 移除 index／address，file 映射为 sourceFile。
- 条件失败只报告外层错误；不使用旧记录级 errors。
- inspect.code 不传入 overrides／earlyReturn；统一处理逻辑仅在 override 配置存在时执行覆盖。
- 公共会话层的按需 attach 与 Host 脚本销毁事件清理。

旧 probe.debugger 入口与 observations／原栈帧／记录级 errors 已移除。Host 直接输出 capture、精简 CodeFrame 和 { ok, data, error }，current 与 remove 使用同一结果结构。sdk/ios/probe/debugger.js 转发层已移除；会话清理由 Host 的 src/ios/debugger/session.js 统一负责。

同一执行地址允许多个纯观测注册，各自通过 SetCondition 过滤并独立采集。涉及 override.code 的同地址重叠注册会在安装时被拒绝，不依据条件推断互斥关系，避免采集、赋值和提前返回依赖 callback 顺序。此检查针对注册时已解析的位置；动态加载产生的新位置不在当前保证范围内。
