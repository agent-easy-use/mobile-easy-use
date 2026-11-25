# inspect.code — Android MVP API 设计

[返回 inspect](inspect.md) · [返回总览](README.md) · [Android override](override-android.md)

状态：Android inspect.code 已实现并接入根导出与类型声明，复用 Android JVMTI debugger。实际设备覆盖以 tests/inspect、tests/common 和运行报告为准。iOS 的表达式、传输及生命周期见 [iOS 专项文档](inspect-code-ios.md)。

## 1. 作用与基本形态

观察 App 执行到指定代码位置时的现场，帮助 Agent 判断：位置是否命中、变量当时是什么、某个条件是否成立、调用来自哪里。每次被接收的命中生成一条记录，不使用 method 的 enter／leave，也不提供方法耗时或返回状态。

```typescript
interface CodeContext {
  get(name: string): any;
}

type CodeCapture = Record<string, string | ((context: CodeContext) => any)>;

interface AndroidCodeDefinition {
  className: string;
  method: string;
  argumentTypes?: readonly string[];
  fileLine: number;
  condition?: (context: CodeContext) => boolean;
}

interface CodeOptions {
  capture?: CodeCapture;
  stack?: number;
}

interface CodeFrame {
  className: string;
  methodName: string;
  sourceFile: string | null;
  line: number | null;
}

interface CodeRecord {
  hitId: string; // watcher 内唯一，按进入采集的顺序生成
  timestamp: string; // 进入采集时的 ISO 8601 UTC 时间
  threadId: number;
  threadName: string | null;
  capture?: Record<string, any>;
  stack?: CodeFrame[];
}

type CodeResult =
  | { ok: true; data: CodeRecord[]; error: null }
  | { ok: false; data: CodeRecord[]; error: string };

interface CodeWatcher {
  current(): Promise<CodeResult>;
  stop(): Promise<CodeResult>;
}

// API 签名记法
inspect.code.watch(
  definition: AndroidCodeDefinition,
  options?: CodeOptions,
): Promise<CodeWatcher>;
```

- watch／current／stop 全部异步；watch 成功返回时已经安装观测。
- watcher 只包含 current、stop，不暴露 id 或 registry。
- current／stop 的外层结果只有 ok、data、error；error 成功为 null，失败为字符串，不增加 error.code。
- 配置和记录中的采集字段都叫 capture，不再使用 observations。
- capture 配置是具名采集项映射，不是一个返回 Record 的整体回调。配置决定字段名，各项计算后的值组成记录中的 Record。
- 记录中的 capture 仅约束外层是 Record，字段值可以是任意 JS／Frida 值，不要求 JsonValue。

## 2. definition：代码位置与命中条件

```javascript
{
  className: 'com.example.SearchService',
  method: 'search',
  argumentTypes: ['java.lang.String'],
  fileLine: 42,
  condition: ({ get }) => get('useCache') === true,
}
```

- className 是类名字符串，不使用 target 或实例 wrapper。实例方法、静态方法均按类和方法定位。
- method 使用 Java／Kotlin 的方法名称，按实际运行时方法定位；argumentTypes 可在唯一重载时省略，多重载必须指定，[] 表示无参数。
- fileLine 是正整数源码行号。当前后端在已定位方法的行号表中，选择该行最小的字节码位置；不搜索其他方法、不自动选择附近行，也不覆盖该行的所有字节码位置。
- 行号表示停下时的执行位置，不表示整行已经执行完毕。若要读取赋值后的结果，需要选择赋值完成后可执行的位置，并确认变量此时在作用域内。
- 不提供 Frida 特殊方法名的额外映射，不承诺构造／类初始化方法的定位能力，不支持原生指令地址定位。Kotlin 需按实际生成的 JVM 方法和调试信息定位，不自动还原协程或内联源码语义。
- 依赖项目现有 JVMTI bridge、运行环境能力及方法行号信息。缺少能力、行号或方法时安装失败，不静默回退到 method hook。

condition 在命中现场同步执行，接收 { get }：

- 未提供时接收所有命中。
- 调用方保证返回 boolean；false 不采集、不生成正常记录，true 才执行后续 stack／capture。
- 先判断 condition，再检查容量并创建 record。false 不分配 hitId、不占用记录容量；抛错时仅通过外层 error 报告，不创建 record。
- 不是 Java／Kotlin 表达式字符串，也不是 method 的位置参数 filter。

## 3. capture：读取什么

```javascript
{
  capture: {
    count: 'count',
    hasItems: ({ get }) => get('count') > 0,
    receiver: 'this',
    cached: ({ get }) => get('cached'),
  },
  stack: 8,
}
```

每项的 key 是输出字段名，value 是以下两种形式之一：

| 配置形式 | 含义 |
| --- | --- |
| 字符串 | 调用 get(变量名)，不是字面量字符串，也不是表达式 |
| 同步函数 | 接收 { get }，返回该字段的值，可进行 JS 运算或使用 Frida wrapper |

例如保存固定字符串需要写 `label: () => 'cache-path'`；`label: 'cache-path'` 会被解释成变量读取并失败。

调用方保证 condition／采集函数同步执行，不使用 async、Generator 或返回 Promise；SDK 不额外检测这些误用。不递归校验、序列化或转换返回值内部的字段。单项可以返回 null、undefined、对象、数组或 Java wrapper，组合后的 capture 始终是 Record。

未提供 capture 时只记录命中元数据和可选 stack；提供空映射时 capture 为 {}。不默认枚举全部变量，不递归展开原生对象。

### get 的实际能力

| 输入 | 行为 |
| --- | --- |
| `get('this')` | 当前实例方法的接收对象；静态方法没有 this |
| `get('count')` | 优先查找当前位置作用域内的同名局部变量／参数，再查找实例字段 |
| 同名实例字段 | 局部变量优先；需要明确访问字段时可以使用 get('this') 后的 Frida 字段访问 |
| 父类实例字段 | 按当前实现沿方法声明类的继承关系查找，遵循字段隐藏规则 |
| 静态字段 | 不由 get 的字段回退解析；可在 JS 回调中使用 Java bridge 读取 |
| `get('cached.title')` | 不支持成员路径 |
| `get('count > 0')` | 不支持表达式字符串 |

get 仅接受变量标识符／this，只读取当前命中帧，不提供任意调用栈帧的变量读取。参数按调试信息中的名字读取，不提供自动 args 数组。

缺少局部变量表、变量不在作用域或解析有歧义时返回错误，不能将其解释为 null。当前后端在缺少局部变量信息时不会直接回退到字段，以免错误解析被局部变量遮蔽的名字。

```javascript
capture: {
  count: 'count',
  doubled: ({ get }) => get('count') * 2,
  title: ({ get }) => {
    const cached = get('cached');
    return cached === null ? null : cached.title.value;
  },
}
```

get 返回值经过 Frida Java bridge 的 fromJni 转换。基础类型、String、对象及数组使用对应的 Frida 值；不另建 NativeValue 类型体系。这里的乘法和条件判断是 JS 运算，不是 Java 源码求值。

get 函数只在当前 condition／capture 回调期间有效，不能保存后异步调用。通过 wrapper 调用业务方法可能产生副作用；inspect 不会回滚这些副作用。采集逻辑应避免再次触发被观测位置，不以观测 API 保证任意递归或阻塞调用可用。

## 4. 返回值与原生对象生命周期

与 inspect.method 的具名证据形式一致，capture 的字段值原样保存；数组、CodeRecord、capture 和栈帧等 SDK 管理的外层结构在读取结果时浅拷贝。capture 内部嵌套对象和原生 wrapper 不深拷贝。

当前 get 的 fromJni 调用默认创建 owned wrapper：Frida 建立 JNI 全局引用，并在 wrapper 被 GC 后释放引用。因此新 inspect.code 应遵循：

- 不在命中结束时对 get 返回的 wrapper 主动调用 $dispose。
- 将 wrapper 直接保存到 capture 即可，不要求调用方额外 Java.retain。
- 记录或调用方仍持有 wrapper 时，其原生引用保持有效；所有引用消失后，由 Frida 的 GC 清理机制释放。
- stop 移除观测资源，不销毁结果中保存的 wrapper。调用方显式 $dispose 会影响共享该 wrapper 的所有结果，应自行管理。
- 不保证调用方从其他来源返回的任意 wrapper 都有相同所有权；以上保证针对 get 创建的 owned wrapper。

```javascript
capture: {
  cached: 'cached', // 可以直接保存 get 返回的 Java wrapper
}
```

保存对象引用不等于保存命中时的对象状态。后续 App 修改对象后，通过 wrapper 读取到的可能是新状态。若断言目标是“当时的字段值”，应在 capture 回调里提取字段，而不是之后再读取对象。

capture 允许任意 JS／Frida 值，也意味着结果不保证能直接 JSON.stringify、写入文件或通过未来 CLI 传输；跨进程展示与导出不是本 API 的隐式转换职责。

## 5. stack

- 非负整数，省略或 0 不采集；正数表示最多采集多少帧。
- Android 后端当前接受正的 32 位整数上限；新 API 需将 0 转为不请求 stack。
- 从命中的当前 Java 帧开始，返回 className、methodName、sourceFile、line。文件或行号不可用时为 null。
- 不还原 Kotlin 协程的异步因果链，也不把其他线程的栈拼接进来。

## 6. current／stop 与错误

### current

返回已完成采集的累计记录，不清空、不重新执行 capture、不等待未来命中。尚在采集中的记录不返回；记录按采集完成的顺序排列，并发时 hitId 不保证在数组中递增，时间和顺序不表示跨线程因果关系。

零命中是成功：`{ ok: true, data: [], error: null }`。current 得到的是记录外层快照，不保证原生对象状态被冻结。

### stop

关闭新的命中，等待已经进入的采集回调和原生收尾完成，然后移除本 watcher 的调试资源并返回最终累计记录。不等待所在业务方法执行完毕，不取消业务执行。

- 不在 condition／capture 回调中调用或等待 stop；等待自身采集结束会产生生命周期冲突。
- 并发 stop 共用一次停止操作；成功后重复 stop 返回最终记录的外层快照。
- 清理失败返回 ok: false 和已有数据，允许重试，不能把未完成清理报告成成功。
- stop 开始后 current 返回 ok: false、data: [] 和停止说明；最终数据通过 stop 获取。
- 脚本卸载需释放观测的原生资源。保存的 Java wrapper 由 Frida 自身的引用生命周期管理。

### 错误与部分结果

安装配置非法、方法／位置不可用或后端安装失败时，watch 拒绝 Promise，不返回不可用 watcher。

运行时某项 capture 失败，省略该字段，保留其他成功字段，通过外层 error 标明命中 ID、字段名和错误字符串；不能用 null 代替失败。stack 失败不阻止 capture。外层 ok: false、error 给出错误说明，data 保留部分记录。

```javascript
{
  ok: false,
  data: [{
    hitId: 'h1',
    timestamp: '2026-11-04T08:00:00.000Z',
    threadId: 1234,
    threadName: 'worker',
    capture: { count: 3 },
  }],
  error: 'capture missing, hit h1: Variable is unavailable',
}
```

只保留首个采集错误到外层 error，不提供记录级 errors，不枚举所有错误。成功字段继续保存；后续 current／stop 不因下一次采集成功而清除已有错误。原生层在进入采集前失败时，只报告外层 framework 错误，不构造无采集现场的记录。

## 7. 完整使用示例

以下业务类、字段和行号为示例，实际使用时以 App 源码及运行时调试信息为准。第 42 行需位于 cached 赋值完成且仍处于作用域的位置。

```javascript
const watcher = await inspect.code.watch(
  {
    className: 'com.example.SearchService',
    method: 'search',
    argumentTypes: ['java.lang.String'],
    fileLine: 42,
    condition: ({ get }) => get('useCache') === true,
  },
  {
    capture: {
      normalized: 'normalized',
      cacheHit: ({ get }) => get('cached') !== null,
      cached: 'cached',
      titleAtHit: ({ get }) => {
        const cached = get('cached');
        return cached === null ? null : cached.title.value;
      },
    },
    stack: 8,
  },
);

let result;
try {
  // 在此使用 drive 或业务操作触发搜索，并等待目标场景完成。
  const progress = await watcher.current();
  // 可多次读取；不会重新执行 condition 或 capture。
} finally {
  result = await watcher.stop();
}

if (!result.ok) throw new Error(result.error);
if (result.data.length === 0) throw new Error('Expected the cache path to execute');
if (!result.data.some(record => record.capture.cacheHit === true)) {
  throw new Error('Expected a cache hit');
}
// cached 仍可作为 wrapper 使用；titleAtHit 才表示采集当时提取的字段值。
```

仅确认代码路径时无需配置 capture：

```javascript
const watcher = await inspect.code.watch({
  className: 'com.example.SearchService',
  method: 'search',
  argumentTypes: ['java.lang.String'],
  fileLine: 42,
});
// 驱动 App 后：
const result = await watcher.stop();
```

## 8. 与当前实现的差异及待 review 项

已有能力：JVMTI 位置定位、condition({ get })、按名字读变量／实例字段、同步 JS 计算、Java 调用栈、独立记录部分失败、异步关闭并等待在途采集完成。

本轮已落实的改动：

- 新增 inspect.code 模块，使用 className 与 capture；watch 返回只有 current／stop 的 watcher。
- 新增累计快照 current，并统一 ok／data／error、ISO 时间及拍平的 threadId／threadName。
- 移除新采集路径的 snapshot 序列化及临时 wrapper 主动 $dispose，直接保存 capture 值。底层只提供 registerBreakpoint；inspect.code 自行实现 onHit/onFinish，不经过旧 debuggerProbe 采集路径。
- 不请求 override 或 earlyReturn；观测 API 不暴露写变量和提前返回操作。
- 实现 stack: 0 的关闭语义，确保错误与清理重试符合上述契约。

当前每个 watcher 最多保存 10,000 条记录（在途采集占用容量）；超限拒绝新增采集并报告错误，不在命中回调中注销。停止后仍需由调用方释放不再使用的 watcher／结果引用，原生 wrapper 才能随 GC 回收。

后续 review：同位置多个 watcher 与 override.code 共存的规则。当前文档不承诺这些组合的安装顺序或行为，也不新增 CLI 标识、分页或游标。iOS 首次使用自动 attach／脚本卸载 detach 不属于本文范围。

### 底层资源清理

`inspect.code` 和 `override.code` 的断点统一由 `sdk/android/common/debugger/index.js` 注册和持有。各自的 `stop/remove` 调用同一底层清理闭包：关闭断点、等待在途回调完成、释放 JVMTI environment 和 JNI 引用，再移除注册。底层仅导出 registerBreakpoint，不提供 debuggerProbe 或 install。inspect.code 自行实现条件、capture、记录及 onHit/onFinish；override.code 自行实现条件、变量修改、提前返回、诊断记录及 onHit/onFinish。

脚本卸载时，底层通过一次 `Script.bindWeak` 清理全部剩余注册，期间 `Script.pin/unpin` 保持异步清理所需的运行环境，并拒绝新增注册。SDK 不再导出 `dispose`。清理不撤销此前已经发生的业务副作用。
