# inspect.log — MVP API 设计

[返回 inspect](inspect.md) · [返回总览](README.md)

状态：双端 inspect.log 已实现并接入根导出与类型声明。watch/current/stop 均为异步；实际设备覆盖以 tests/inspect 和运行报告为准。

## 1. 作用与 API

观察当前 App 进程在安装之后产生、且命中过滤条件的日志，返回可直接分析和断言的记录。不读取历史日志，不依赖 action，不自动写入证据文件。

```typescript
interface LogRecord {
  timestamp: string; // 进入采集回调时的 ISO 8601 UTC 时间
  threadName: string | null; // 线程名，获取不到时为 null
  threadId: number;          // 采集回调所在的原生线程 ID
  tag: string;
  level: string | null;
  message: string;
}

type LogResult =
  | { ok: true; data: LogRecord[]; error: null }
  | { ok: false; data: LogRecord[]; error: string };

interface LogWatcher {
  current(): Promise<LogResult>;
  stop(): Promise<LogResult>;
}

// 以下为 API 签名记法
inspect.log.watch(tags: readonly string[]): Promise<LogWatcher>;
```

- watcher 只有 current、stop，不暴露 id、状态或其他方法。
- current／stop 的结果只有 ok、data、error；三个字段始终存在。error 成功时为 null，失败时为描述原因的字符串，不包含 code 或嵌套 message 字段。
- data 始终是 LogRecord 数组，不再嵌套 records。失败时仍可返回已采集的部分日志；没有数据时为 []。
- LogRecord 只有 timestamp、threadName、threadId、tag、level、message，不增加 eventId、sequence、type 等字段。
- 不在 SDK log 的公开 API 中提供 evidenceId、observationId 或订阅管理接口。未来 CLI 如需跨命令定位 watcher，由控制端自己管理。

## 2. watch：开始采集

```javascript
const watcher = await inspect.log.watch(['Search', 'Network']);
```

- tags 是非空字符串数组；不接受空字符串或包含 NUL 的字符串，重复项去重。保持原字符串匹配，不隐式 trim、忽略大小写或解释通配符。
- Promise 成功完成时，观测已经安装，可以开始驱动 App。
- 首次 watch 懒加载共享 runtime：Android 编译 CModule 并安装一个 listener；iOS 解析 bridge 接口并安装一次 NSLog replacement。初始化过程同步完成，首次并发 watch 也复用同一个 runtime。
- 每次 watch 注册独立的「watcher → TAG 集合 → 回调」关系。允许多个 watcher 同时活动，TAG 集合可以重叠；一条日志分别交付给所有匹配的 watcher，对每个 watcher 最多交付一次。
- 每个 watcher 独立保存记录、错误及缓冲预算，current／stop 只作用于自身。
- 初始化或注册失败拒绝 Promise，使用 Error.message 描述原因，不返回不可用 watcher。注册失败不影响已有订阅；已经成功初始化的共享 runtime 保留，后续可再次注册。

```javascript
const [search, requests] = await Promise.all([
  inspect.log.watch(['Search']),
  inspect.log.watch(['Search', 'Network']),
]);
// Search 日志进入两者；Network 只进入 requests。
const searchResult = await search.stop();
// requests 继续接收 Search 和 Network 日志。
const requestResult = await requests.stop();
```

watch 直接返回 watcher，所以安装错误使用 Promise rejection；current／stop 的运行错误使用 LogResult 表达，不再用第二套返回结构。

## 3. current：读取累计快照

```javascript
const result = await watcher.current();
```

- 获取执行快照操作时已经接收的全部日志，不清空、不停止、不等待未来日志。
- 后续采集不改变已返回结果；修改调用方收到的数据也不得改变 watcher 内部缓存。
- data 按采集顺序排列。timestamp 是采集时间，不是日志系统的原始时间，不代表线程间因果顺序；不同记录可以有相同时间。
- 零命中是成功：`{ ok: true, data: [], error: null }`。
- stop 已开始后不再接受 current；返回 `{ ok: false, data: [], error: 'Log watcher has stopped' }`，不重新采集。

## 4. stop：停止并返回最终结果

```javascript
const result = await watcher.stop();
```

- 关闭本 watcher 的采集，注销其订阅，等待使用该订阅的在途处理退出并释放资源，返回最终累计数据。其他 watcher 继续工作，共享 listener 不随单个 watcher 停止而卸载。
- 不撤销原日志输出，不清除已经返回的快照。
- 并发 stop 共用一次停止操作；完成后重复 stop 返回相同内容的最终结果，不重复清理。结果内容须与内部缓存隔离，不要求 JS 对象引用相等。
- 注销或清理失败返回 ok: false、错误字符串和已采集数据；保留该订阅所需资源供再次 stop 重试。失败只影响本 watcher，不阻止其他 watcher 工作或新 watcher 注册。
- 如果资源已清理，但采集期间发生错误，最终结果仍为 ok: false；该最终结果可缓存，不因采集错误重复执行清理。
- 不承诺排空所有在途原生日志调用。返回已接收的记录，停止后到达的回调不追加记录，也不能混入后续 watcher。

三个方法统一使用 Promise 是 API 约定，不代表当前底层操作都需要等待 Host。不得在可能阻塞日志收尾的原生 hook 回调中等待 stop。

## 5. 双端采集范围

| 项目 | Android | iOS |
| --- | --- | --- |
| 入口 | liblog 的日志入口；优先 __android_log_write_log_message，旧环境回退 __android_log_buf_write | NSLog，依赖 App 集成的原生日志 bridge |
| TAG | 精确匹配 TAG | 沿用 bridge 的前缀约定：固定格式 `[TAG] `；另支持格式串以 `[%@]` 开头、首个对象参数为匹配 TAG 字符串的形式 |
| level | 使用 v／d／i／w／e／f；未知 priority 为 `priority-N` | null，NSLog 不提供对应级别 |
| message | 入口提供的日志文本 | 格式化后的 NSLog 完整文本，保留 `[TAG]` 前缀 |
| 范围 | 当前进程命中入口的日志，不是全设备 logcat | 不承诺捕获直接调用 NSLogv、os_log、stdout 等其他渠道 |

threadName 获取不到时为 null，不把线程未命名视为采集失败。采集应保留 App 原日志行为，不能因为过滤或采集失败而吞掉原日志。

## 6. 错误与采集限制

| 场景 | 表达方式 |
| --- | --- |
| tags 非法 | watch 拒绝，Error.message 说明参数问题 |
| 原生符号、bridge 不可用，或初始化／订阅注册失败 | watch 拒绝，Error.message 说明安装失败原因 |
| 停止开始后调用 current | 失败结果，data 为 []，error 说明已停止 |
| 已知的日志读取／采集错误 | 失败结果，保留已采集数据，error 说明采集失败原因 |
| 达到缓冲限制 | 失败结果，保留已采集数据，error 说明达到限制 |
| 订阅注销／资源清理失败 | 失败结果，保留已采集数据，error 说明清理失败原因 |

已知采集错误不能静默丢弃后返回 ok: true。只保留首个采集错误，后续读取继续反映该错误；stop 清理失败时优先返回清理失败的错误字符串。原生后端尚无法报告的漏采不属于可检测错误，ok: true 也不表示捕获了 App 的所有真实日志。

缓冲必须有记录数和文本大小限制，达到限制后停止追加，通过 error 字符串说明已达到采集限制，调用方仍须 stop 释放资源。MVP 不增加预算 options、cursor 或增量读取接口；每个 watcher 默认最多保存 10,000 条日志，tag／message／threadName 累计不超过 2,097,152 个 UTF-16 code unit（约 4 MiB 文本，不含 JS 对象和快照开销）。下一条日志会超限时丢弃该条并标记失败，保留该 watcher 的订阅，之后拒绝追加；其他 watcher 不受影响。调用方仍须 stop 注销订阅并释放资源。不增加 truncated 字段，也不伪造一条日志表示截断。

## 7. 探查与断言示例

```javascript
const watcher = await inspect.log.watch(['Search']);
let finalResult;
try {
  const action = await drive.click(searchButton);
  if (!action.ok) throw new Error(action.error.message);

  // 异步业务需等待明确的完成条件；click 返回不等于日志已经产生。
  const ready = await drive.waitUntil(isSearchFinished);
  if (!ready.ok) throw new Error(ready.error.message);

  const current = await watcher.current();
  if (!current.ok) throw new Error(current.error);
  console.log(current.data);
} finally {
  finalResult = await watcher.stop();
  if (!finalResult.ok) throw new Error(finalResult.error);
}

suite.expect(finalResult.ok).toBe(true);
suite.expect(
  finalResult.data.some(log =>
    log.tag === 'Search' && log.message.includes('request completed')
  ),
).toBe(true);
```

成功返回示例：

```javascript
{
  ok: true,
  data: [{
    timestamp: '2026-10-30T10:00:00.000Z',
    threadName: 'main',
    threadId: 123,
    tag: 'Search',
    level: 'i',
    message: 'request completed',
  }],
  error: null,
}
```

失败返回示例（实际 data 可以包含已采集日志）：

```javascript
{
  ok: false,
  data: [],
  error: 'Timed out waiting for in-flight log capture callbacks',
}
```

## 8. 注册、注销与资源生命周期

双端使用原生订阅列表，MVP 不建立 TAG 反向索引，不引入通用 registry 框架。未命中任何订阅的日志不进入 JS。

| 内部操作 | 作用 |
| --- | --- |
| register(tags, callback) | 创建订阅节点，并在锁内加入列表；返回内部订阅指针 |
| unregister(subscription) | 获取写锁，等待读锁内回调结束，移除并释放节点；JS 清理闭包保证只执行一次 |

双端使用 pthread 读写锁保护 subscriptions：日志线程持读锁遍历订阅列表、精确匹配 TAG 并执行回调，结束后释放读锁；register／unregister 持写锁修改列表。多个读者可以并行；写锁独占，等待所有持读锁的回调结束。unregister 在写锁内移除并释放节点，不需要在途计数、pending／release 接口、轮询或超时。无需匹配结果数组、独立 TAG 表、hash 位图或消费线程。

stop 先禁止自身追加记录，再调用 unregister；原生调用保持 cooperative 模式，等待写锁时释放 JS 锁，让已有回调继续完成。注销返回后释放 TAG 数组和回调的 JS 引用。列表共享一把读写锁，因此 stop 可能等待其他订阅的回调。内部日志回调只采集记录，不调用 register／unregister；容量超限只拒绝记录，不自动注销。

共享 runtime 和 listener 保留至脚本卸载，即使订阅列表已空也不重复拆装。JS 模块保持所有尚未释放订阅的资源引用，调用方丢弃 watcher 并不等同于 stop。脚本卸载时自动注销剩余订阅，临时 pin 脚本并等待在途处理退出后再完成卸载。

## 9. 双端实现边界

- **Android**：一个 CModule listener 处理全部订阅。原生侧精确匹配 TAG，命中后才跨入 JS 获取文本、时间与线程信息。保留现代 liblog 入口及旧入口回退。CModule 绑定 libc 的 pthread_rwlock 接口，按 Android bionic ABI 分配锁内存（64 位 56 字节，32 位 40 字节）。
- **iOS**：一个 NSLog replacement 处理全部订阅，固定前缀或动态 TAG 在原生侧匹配。同一条日志只为采集格式化一次，分发给所有匹配订阅；原始 NSLogv 输出独立执行一次。订阅列表为空时快速返回原输出流程。新 bridge 提供 `mobile_easy_use_register_nslog_watch`、`mobile_easy_use_unregister_nslog_watch`，替换旧单 capture 接口，须重新编译并集成 bridge。
- **超限**：保留订阅，命中后回调拒绝追加；其他订阅继续采集。调用方须 stop 释放资源。没有匹配订阅时，iOS 不为采集格式化消息。
- **性能**：日志匹配及 JS 回调均在读锁内，未命中时不进入 JS；同一 Frida JS runtime 的执行仍由 Frida 串行协调。写锁等待所有现有读者退出，公平性由平台实现决定，实际吞吐与锁竞争需真机测量。
