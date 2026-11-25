# inspect.method — MVP API 设计

[返回 inspect](inspect.md) · [返回总览](README.md)

状态：双端 inspect.method 已实现并接入根导出与类型声明。watch/current/stop 均为异步；平台边界见下文，实际设备覆盖以 tests/inspect 和运行报告为准。

## 1. 作用与 API

观察一个方法在安装之后的调用，帮助 Agent 回答：是否执行、执行几次、何时执行、在哪个线程、是否返回、耗时多少。通过可选的 enter／leave 提取参数、返回值及相关对象状态，通过 stack 获取调用来源。探查结果可以直接参与自动化断言，不依赖 action，不自动写入证据文件。

```typescript
type MethodResult =
  | { ok: true; data: MethodRecord[]; error: null }
  | { ok: false; data: MethodRecord[]; error: string };

interface MethodWatcher {
  current(): Promise<MethodResult>;
  stop(): Promise<MethodResult>;
}

// API 签名记法；PlatformMethodDefinition、平台上下文类型分别声明。
inspect.method.watch(
  definition: PlatformMethodDefinition,
  options?: MethodOptions,
): Promise<MethodWatcher>;
```

- watcher 只包含 current、stop，不暴露 id 或额外管理操作。
- current／stop 始终返回 ok、data、error。error 成功时为 null，失败时为字符串，不增加 error.code。
- data 是 MethodRecord 数组，失败时保留已采集的部分数据，零命中为 []。
- 不暴露 evidenceId、observationId 或公共 registry。未来 CLI 的 watcher 标识由控制端管理。

## 2. definition：定位和筛选调用

定位字段与 override.method 一致，不使用 target 或实例 wrapper 定位，不额外封装实例级 hook。

### Android

```javascript
{
  className: 'com.example.SearchService',
  method: 'search',
  argumentTypes: ['java.lang.String'],
  filter: query => String(query).length > 0,
}
```

- className、method 必填。argumentTypes 可省略，但存在多个重载时必须明确指定；[] 表示无参数重载。
- 一个 definition 定位一个方法，不隐式观测全部重载。
- 实例方法和静态方法都使用 className 定位。MVP 不包含构造方法。

### iOS

```javascript
{
  className: 'SearchService',
  selector: '- search:',
  filter: (...args) => true, // 按业务参数筛选；具体参数类型由 iOS 后端确定
}
```

- className、selector 必填；selector 使用 `- ` 表示实例方法、`+ ` 表示类方法。
- 面向 Objective-C runtime 中的方法，不承诺任意纯 Swift 方法。
- 与 Android 一样支持 definition.filter；iOS override.method 也已支持该字段。当前 inspect 同样使用 ObjC.implement，filter 接收 NativeCallback ABI 参数，不经过高层 ObjC bridge 转换。

### filter

- 位于 definition，签名为 `filter(...args) => boolean`，参数按原方法顺序排列，不含 this／self／_cmd。
- 在进入时同步执行；未提供时采集所有命中，只有返回 true 才接收本次调用。
- 本次筛选结果用于整个调用，不在退出时重新筛选。
- filter 只控制采集，不决定原方法是否执行，也不替换其返回值。
- filter 抛错属于采集失败，记录错误并跳过本次采集，仍执行原方法。

## 3. options：进入、退出和来源

```typescript
// 共同结构示意；各字段的实际 Frida 类型见下方双端约定。
interface EnterContext {
  receiver: unknown;
  args: readonly unknown[];
}
interface LeaveContext extends EnterContext {
  result: unknown;
  exception: unknown;
}
interface MethodOptions {
  enter?: (context: EnterContext) => Record<string, any>;
  leave?: (context: LeaveContext) => Record<string, any>;
  stack?: number; // 非负整数；省略或 0 不采集，正整数指定最多采集的帧数
}
```

以上 unknown 仅用于共同结构示意，根类型声明接入时分别使用平台类型：

- Android：receiver 是 Java 实例／类 wrapper，args、result 是 Java bridge 转换后的 JS 值；exception 是原方法抛出的异常对象。
- iOS：receiver 是 ObjC.Object（实例或类）；args 使用 NativeCallbackArgumentValue，result 使用方法 ABI 对应的原生返回值。对象／SEL／指针仍是 NativePointer，BOOL 为数值，64 位整数及结构体沿用 Frida ABI 类型；不会自动转换为 ObjC.Object。exception 在支持的正常返回路径为 undefined。
- iOS 使用 ObjC.implement 转发到安装前保存的 IMP，支持 Frida 可表达的固定方法签名，不支持可变参数方法。Objective-C 异常跨 JS replacement 展开不在支持范围内，不提供 threw 或异常 leave 保证；会抛 NSException 的方法不要使用此 API。

### iOS 回调参数的转换边界

与 [override.method](override-ios.md#method-的参数与返回值转换) 一致，当前使用 ObjC.implement／NativeCallback，不经过 ObjC bridge 高层的 fromNative／toNative 转换。filter、enter.args、leave.args 以及 leave.result 使用 ABI 值；只有 receiver 由 SDK 显式包装成 ObjC.Object。这与通过 obj.someMethod_(...) 调用方法时的高层转换不同。

| 原方法类型 | 观测回调中收到的值 | 使用方式 |
| --- | --- | --- |
| 对象（id、NSString * 等） | NativePointer；nil 是空指针，不是 JS null | 先用 isNull() 判断，再按需 new ObjC.Object(value) |
| BOOL | 数值 0／1 | 按需转换为 value !== 0 |
| SEL／普通指针 | NativePointer | 按实际类型解释，不作为 ObjC.Object 包装 |
| int64／uint64 | Int64／UInt64 | 保留 wrapper，避免转 number 丢失精度 |
| 其他数值／结构体 | Frida ABI 对应的 number／数组等 | 按方法实际签名读取 |

```javascript
// 假设原方法是 - (BOOL)hasTitle:(NSString *)title;
{
  enter: ({ args }) => ({
    title: args[0].isNull() ? null : new ObjC.Object(args[0]).toString(),
  }),
  leave: ({ result }) => ({ enabled: result !== 0 }),
}
```

enter／leave 返回的 Record 是观测证据，不会作为原方法返回值交给 NativeCallback，也不进行高层类型转换。原生引用的保活规则仍由调用方负责。

| 上下文字段 | 说明 |
| --- | --- |
| receiver | 本次调用的接收对象；实例方法对应实例，静态／类方法对应类 |
| args | 原方法业务参数，不含隐式 this／self／_cmd |
| result | 正常退出时的返回值；异常退出时为 undefined；void 返回按平台契约表达 |
| exception | 正常退出时为 undefined；可观测的异常退出时为捕获的异常 |

- enter 在原方法执行前触发，只接收 receiver、args，不包含 result。
- leave 在可观测的方法退出时触发，接收 receiver、args、result、exception。支持异常观测的后端也应在异常退出时触发 leave。
- 两个回调都同步执行，不接受 async 函数或 Promise 结果，不等待 Host。
- 回调返回值是要保存的观测数据，不是要替换的业务返回值。SDK 负责执行原方法，并保留其返回／抛异常行为。
- enter／leave 返回以字段名组织的信息合集，即 Record<string, any>，而不是直接返回一个标量、数组或原生 wrapper。只观察一个值时也使用具名字段，如 `({ result }) => ({ result })`。
- 仅约束返回值的外层组织方式；字段值可以是任意同步 JS 值，包括 undefined、null、数组、普通对象，以及 Frida 的 Java.Wrapper、ObjC.Object、NativePointer 等。不要求 JSON 可序列化，不进行默认 JSON 转换或原生对象自动展开。
- 保存 wrapper／指针不等于保存原生对象状态快照；之后读取字段可能看到变化后的状态。需要固定历史状态时，在回调内显式提取字符串、数值等数据。
- 原生值由调用方负责保活和释放。SDK 保存 JS 字段引用，不递归 retain／release 任意字段。Android 需跨回调保留 Java.Wrapper 时应在采集回调内使用 Java.retain，使用结束后 $dispose；原生数组按 Frida 对应类型的生命周期处理。iOS 若需持有对象，应显式创建 ObjC.Object 并按所有权规则 retain／release；裸指针指向的内存有效期由其所有者负责。
- stop 不释放调用方自行 retain 的对象；这些引用可在 stop 后继续使用，直到调用方释放或脚本卸载。仅把借用 wrapper／指针放入 Record 不会延长底层对象或调用帧的寿命。
- 不默认提供任意嵌套对象深拷贝。未来 CLI 若需传输这些值，应另定序列化或引用管理协议，不以 CLI 的 JSON 要求限制当前脚本 API。
- leave.args 中的可变对象可能已被方法修改；需要进入状态时，必须在 enter 中提取快照。args 可用于退出采集是目标契约，后端必须处理其有效期，不能保留失效的调用帧地址。
- 采集回调按只读方式使用；调用对象方法仍可能有副作用，SDK 不提供沙箱。
- stack 只在进入时采集调用栈，表示调用来源，不是整个方法内部的调用树；stack 必须为非负安全整数；省略或 0 不采集，正整数表示最多采集的帧数，例如 `stack: 10`。实际结果可以少于请求值；iOS 受 Frida 原生回溯上限约束，当前最多 16 帧，超过上限的请求不会自动获取更深的栈。Android 帧为 `{ className, methodName, signature, fileName, lineNumber }`；iOS 帧为 `{ address, moduleName, name, fileName, lineNumber }`，缺失的可选符号信息为 null。

## 4. 默认观测与记录结构

不传 options 也可观测执行事实，但不自动展开参数、返回值、异常内容、接收对象状态或调用栈。

```typescript
interface MethodRecord {
  callId: number; // watcher 内唯一，跨 current 快照保持稳定
  timestamp: string; // 进入观测时的 ISO 8601 UTC 时间
  threadId: number; // 进入时的原生线程 ID
  threadName: string | null; // 获取不到时为 null
  status: 'running' | 'returned' | 'threw';
  durationMs: number | null; // 尚未观察到退出时为 null
  enter?: Record<string, any>;
  leave?: Record<string, any>;
  stack?: AndroidStackFrame[] | IOSStackFrame[]; // 帧字段见 options 说明
}
```

| 状态 | 含义 |
| --- | --- |
| running | 已观察到进入，尚未观察到退出 |
| returned | 已观察到正常返回 |
| threw | 已观察到异常退出，仅适用于后端支持的异常路径 |

- 每次被接收的调用创建一条记录，退出时更新内部记录。递归和并发调用分别记录，按进入观测的顺序排列。
- enter／leave 保存相应回调返回的信息合集；未配置或采集失败时省略对应字段。字段值可以为 null／undefined，外层返回值仍须是信息合集，例如 `{ result: null }`。
- durationMs 表示同步方法调用的经过时间，应使用单调时钟计算；不是 CPU 时间，也不是异步业务完成时间。Android 使用 System.nanoTime，iOS 使用 CLOCK_UPTIME_RAW；从 enter／stack 采集结束后测到原方法返回／抛异常后、leave 采集之前，包含 bridge 转发开销。
- 时间戳不保证唯一，不据此推断跨线程因果。MVP 不增加 finishedAt、退出序号、parentCallId 或独立 enter／return 事件。
- running 不证明方法卡死；stop 后仍为 running，只说明停止观测前没有观察到退出。
- 若方法只是发起异步任务后返回，status 为 returned 不代表任务已完成。应另行观测完成回调或结果处理方法。

默认返回示例：

```javascript
{
  ok: true,
  data: [{
    callId: 1,
    timestamp: '2026-11-03T08:00:00.000Z',
    threadId: 123,
    threadName: 'main',
    status: 'returned',
    durationMs: 12.5,
  }],
  error: null,
}
```

## 5. watch／current／stop

### watch

- 安装成功后返回 watcher；Promise 完成时可以开始驱动 App。
- 参数非法、方法不存在或安装失败时拒绝 Promise，错误使用 Error.message 表达；失败不得留下本次安装的残留 hook。
- 多方法分别创建 watcher。Android 若目标已有非空 implementation，拒绝安装（包括现有 override 或 inspect）；iOS 同一个 Objective-C Method 只允许一个本模块 watcher，可以观察安装前已有的 IMP 替换。
- 双端 stop 检查目标当前实现仍属于本 watcher；若已被替换，报告错误并保留清理状态，避免覆盖后来者。iOS 在已有 override 上安装 inspect 时必须先 stop inspect 再 remove override；安装后不支持任意顺序叠加／移除其他 hook。
- MVP 不提供采集重入保护。调用方须保证 filter、enter／leave 等采集逻辑不会再次触发被观测方法。原方法自身的递归和不同线程的正常调用分别记录。

### current

- 返回执行快照操作时的累计记录，不清空、不停止、不等待方法退出。
- data 数组、MethodRecord 及 enter／leave 信息合集的外层采用独立浅拷贝；后续退出不会更新先前结果的 status／durationMs 或补入 leave。任意嵌套对象和 Frida 值不保证隔离，可能共享引用；调用方应按只读方式使用。
- 零命中返回 `{ ok: true, data: [], error: null }`。
- stop 开始后，current 返回失败结果，data 为 []，error 说明 watcher 已停止。

### stop

- 立即停止接受新的观测和记录更新，移除本 watcher 的观测并返回最终快照。
- 不等待业务方法返回，不取消原方法或其异步任务。已记录但未观察到退出的调用保留 running，后续退出不修改最终结果。
- 底层资源必须按后端允许的时机安全回收；不等待业务结束不意味着可以提前释放仍被在执行的 hook 使用的资源。
- 并发 stop 共用一次停止操作；成功后重复 stop 返回相同的最终记录内容，不重复清理；外层浅拷贝、嵌套值引用规则与 current 一致，不保证所引用原生对象的状态被冻结。
- Android 拒绝已有 implementation 的方法，因此不支持重复 watch。iOS 支持同一方法重复 watch，由调用方保证按安装的逆序 stop（后创建、先停止）。
- stop 会检查当前方法实现是否仍属于本 watcher；若被后续替换覆盖，返回失败，不覆盖该替换。iOS 顺序错误时，本 watcher 已停止采集，待后创建的 watcher 停止后可再次 stop 完成恢复。
- 清理失败返回失败结果和已有数据，允许再次 stop 重试；采集错误本身不导致重复清理。
- 脚本卸载应处理未停止 watcher 的资源，具体机制由平台后端确定。

## 6. 错误与容量限制

| 场景 | 表达方式 |
| --- | --- |
| definition／options 非法、方法定位或安装失败 | watch 拒绝 Promise |
| filter／enter／leave／stack 采集失败，或采集返回值不符合外层 Record 约定 | ok: false、error 字符串，保留已采集数据 |
| 原方法正常抛出且后端可捕获 | status: threw；业务异常本身不使采集结果 ok: false |
| 达到缓冲限制 | 拒绝新增调用记录，ok: false，保留已有数据 |
| stop 清理失败 | ok: false，保留数据和重试清理所需资源 |

采集失败不得替换原方法结果或吞掉原异常。错误字符串应包含可用的 callId 和失败阶段，便于在不增加嵌套错误结构的情况下定位问题。保留首个采集错误；stop 清理失败时优先报告清理错误。

每个 watcher 最多保存 10,000 条调用记录，达到上限后拒绝新增记录并报告错误，已接收调用仍可完成 leave 更新。由于 Record 允许任意嵌套 JS 值及原生引用，SDK 不遍历或序列化字段计算大小，也不承诺总字节数上限；调用方应提取所需字段，避免保留大型对象。MVP 不增加预算 options、cursor 或自动注销。ok: true 不承诺捕获所有真实执行或所有异常路径。

## 7. 探查与断言示例

### 默认执行事实

```javascript
const watcher = await inspect.method.watch({
  className: 'com.example.SearchService',
  method: 'search',
  argumentTypes: ['java.lang.String'],
});
let result;
try {
  await triggerSearch(); // 业务示意函数
  await waitForSearchFinished(); // 明确等待业务完成，不以方法返回代替
} finally {
  result = await watcher.stop();
}
if (!result.ok) throw new Error(result.error);
if (result.data.length !== 1) throw new Error('Expected exactly one search call');
if (result.data[0].status !== 'returned') throw new Error('Search did not return during observation');
```

### 参数、返回值与对象前后状态（Android 目标用法）

```javascript
const watcher = await inspect.method.watch(
  {
    className: 'com.example.SearchService',
    method: 'search',
    argumentTypes: ['java.lang.String'],
    filter: query => String(query).length > 0,
  },
  {
    enter: ({ receiver, args }) => ({
      query: String(args[0]),
      serviceId: String(receiver.id.value),
      cacheSize: receiver.cache.value.size(),
    }),
    leave: ({ receiver, args, result, exception }) => ({
      query: String(args[0]),
      cacheSize: receiver.cache.value.size(),
      resultCount: exception !== undefined || result === null ? null : result.size(),
      exception: exception === undefined ? null : String(exception),
    }),
    stack: 10,
  },
);

const snapshot = await watcher.current();
// data[n].enter / leave 是具名信息合集；本例显式提取状态值。
const finalResult = await watcher.stop();
```

### 保留原生值的返回形态

```javascript
const options = {
  enter: ({ receiver, args }) => ({ receiver, query: args[0] }),
  leave: ({ result, exception }) => ({ result, exception }),
};
// 允许信息合集包含原生 wrapper；这是返回形态示例。
// 本例仅说明字段类型；跨回调使用借用值前，调用方须完成平台要求的保活。
```

### iOS 定位示例

```javascript
const watcher = await inspect.method.watch({
  className: 'SearchService',
  selector: '- search:',
});
const result = await watcher.stop();
```

iOS 对象参数显式读取示例：

```javascript
const watcher = await inspect.method.watch(
  {
    className: 'SearchService', selector: '- search:',
    filter: query => !query.isNull(),
  },
  {
    enter: ({ args }) => ({ query: new ObjC.Object(args[0]).toString() }),
    leave: ({ result }) => ({ resultAddress: result.toString() }),
  },
);
```

此例假设 search: 的参数和返回值都是对象指针；以方法实际 ABI 为准。

## 8. 实现与验证边界

### iOS MVP 后端与非目标

- 保留 ObjC.implement 和原 IMP 转发，复用 Frida 基于方法签名的 ABI 类型转换；本轮不切换 Interceptor.attach，不自行实现完整 ABI 解码。
- 可变参数方法不属于 MVP 支持范围，包括“只采集 format”的模式。当前方法签名元数据不能可靠识别所有可变参数声明，watch 安装成功不代表该方法受支持；调用方应根据原方法声明选择固定参数方法。
- 原生异常不属于 iOS MVP 能力：不承诺 NSException 跨 JS replacement 的安全展开，也不提供异常 leave／threw。可能抛出 NSException 的调用路径不在支持范围。正常返回 NO／nil、NSError 输出参数属于正常返回，不等同于原生异常展开。
- leave.exception 字段保留统一的上下文形态，在 iOS 支持的正常返回路径中为 undefined。Android 的异常观测能力保持不变。

### 当前实现

- Android 独立使用 Java bridge 的 implementation，并复用静态方法 hook 准备逻辑；不引用旧 action／probe 实现。原方法异常原样重新抛出，采集回调错误单独记录。
- iOS 独立使用 ObjC.implement 与原 IMP 转发；不手工解码浮点、结构体等 ABI 参数。Objective-C 异常展开和可变参数方法不受支持。
- 不创建通用 registry 或跨平台采集框架；两端独立文件保留各自后端差异。
- 原生引用采用调用方所有权；SDK 只复制 Record 外层。结果不保证可直接通过 CLI／RPC JSON 传输。
- 测试覆盖默认记录、筛选、浅拷贝、采集失败、递归、容量限制、停止重试、停止时冻结未完成调用；iOS 宿主实测浮点／结构体／对象／BOOL、类方法、多线程、在途方法 stop、恢复和脚本重载。Android Java hook 的设备验证与 iOS 真机验证仍待完成。
- 两端根 index.js、index.d.ts 保持不动，待全部新 API 完成后统一接入。
