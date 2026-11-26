# drive CLI — 形态讨论稿

状态：设计讨论稿，命令层级与 target 形式已确定，其余公共协议待讨论；尚未实现。本文先讨论 drive 的命令形态，不定义完整 CLI 架构。

API 依据：[drive](../runtime-api-design/drive.md)、[UI target](../runtime-api-design/target.md)。CLI 复用运行时 API 的能力和完成边界，但不要求完整映射 API；函数和原生对象等不适合命令参数的能力保留在脚本中。target 的 CLI 表示与转换见 [target](target.md)。

## 1. 命令结构

drive 下直接提供操作命令：

```text
mobile-easy-use drive click ...
mobile-easy-use drive long-press ...
mobile-easy-use drive input ...
mobile-easy-use drive scroll ...
mobile-easy-use drive wait ...
```

对应 `drive.click / drive.longPress / drive.input / drive.scroll` 与 `drive.wait`。CLI 使用 kebab-case，例如 long-press 对应 longPress。

CLI 按操作展平命令，不要求与 SDK 的命名空间层级一致。`drive input` 表示文本输入，`drive wait` 表示等待 UI 状态。

当前包的 `mobile-easy-use` 入口是 stdio MCP 服务，不支持上述命令。这里沿用可执行文件名作为提案；CLI 与 MCP 的入口共存方式另行讨论。

## 2. 连接上下文

drive 命令必须明确操作哪一个已连接的 App 进程，平台由连接确定。下文暂用 `--connection <id>` 表示选择连接，不表示连接管理协议已经确定。

```bash
mobile-easy-use drive click --connection app-1 --target 'search.submit'
```

建议 drive 命令只负责执行操作，不隐式启动 App、重建连接或切换目标进程。连接如何创建、保存和跨命令访问，留给 CLI 公共设计。

## 3. target 参数

统一使用 `--target`，Android 与 iOS 均支持字符串、path 数组、location 对象三种形式。字符串按平台分别表示 Android 资源名称或 iOS accessibilityIdentifier。

完整写法、解析与平台转换规则见 [CLI target](target.md)。click、input、long-press、scroll 接受三种形式；wait 只接受字符串和 path。不另设 `--id`、`--identifier`、`--path`、`--point` 别名。

## 4. 输入操作示例

```bash
# Android：点击 resource id
mobile-easy-use drive click --connection android-1 --target 'R.id.search_button'

# iOS：长按 identifier
mobile-easy-use drive long-press --connection ios-1 --target 'search.result'

# iOS：输入文本，具体替换/追加行为沿用平台契约
mobile-easy-use drive input --connection ios-1 --target 'search.field' --text 'phone'

# iOS：在指定区域内滑动
mobile-easy-use drive scroll --connection ios-1 \
  --target '["identifier::search.panel","identifier::search.results"]' --direction up

# iOS：坐标点击，单位为 points
mobile-easy-use drive click --connection ios-1 --target '{"x":180,"y":320}'
```

`--text` 必填但允许空字符串；`--direction` 必填，合法值和方向含义沿用平台契约，表示手指滑动方向。long-press 暂不增加时长参数，其他输入操作命令也不增加 API 尚未提供的手势选项。

输入返回成功，只表示达到该输入的完成边界。CLI 不隐式等待页面、截图或断言。沿用 SDK 的平台延时，不再叠加 CLI 固定 sleep。

## 5. wait 形态

### UI 条件

```bash
mobile-easy-use drive wait --connection ios-1 \
  --target 'search.results' --state visible --timeout-ms 5000 --interval-ms 100
```

`--state` 必填，使用平台支持的 exists、visible、hidden、focused、enabled 等状态。hidden 要求元素存在且不可见，不等于不存在。

`--timeout-ms`、`--interval-ms` 为可选正数，省略时交给 SDK 使用默认值，避免 CLI 维护另一份默认策略。API 文档当前建议值为 5000 ms 和 100 ms。

### 任意条件：waitUntil

`drive.waitUntil` 接收函数，不能直接作为 JSON 参数传输。结构化 drive 命令提供 `wait`，不要求映射 `waitUntil`；任意业务条件通过脚本调用 `drive.waitUntil`。

脚本加载与调用方式由公共脚本入口定义，不增加 `drive wait until` 子命令、`--predicate` 字符串求值或新的表达式 DSL。

predicate 读取原生 UI 时仍需遵守平台线程要求；CLI 轮询不能替代运行时内的函数执行，也不能解决 predicate 本身不结束的问题。

## 6. 输出与失败语义提案

建议默认向 stdout 输出一份 JSON 结果，诊断日志写 stderr，便于 Agent 和 shell 脚本消费。成功取得 SDK 结果时保留其字段，不裁剪平台诊断信息。

```json
{ "ok": true, "action": "click" }
```

正常操作失败保留 SDK 的 `ok: false` 与错误信息，进程使用非零退出码；`wait` 超时也属于此类。具体错误码以平台实现为准。

CLI 参数错误、连接错误、等待响应时通信中断，应与 SDK 已返回的操作失败区分。统一 envelope 与退出码编号留给公共协议确定；不能把通信中断包装成“点击未发生”。

- 不自动重放完成状态未知的点击或文本输入。
- `--timeout-ms` 是 UI 等待条件的超时，不表示 input 超时，也不等于传输超时。
- 命令被中断或传输超时，不代表底层输入、等待或业务请求已取消。取消能力需要另行定义。
- CLI 对返回结果负责，业务是否正确由后续 inspect / expect 判断。

## 7. 待讨论项

1. 连接如何创建、选择并跨命令访问？
2. 公共输出 envelope 与退出码如何定义？
3. 公共脚本入口如何承载任意业务条件和场景组合？

连接管理、公共输出协议和脚本执行方式会影响上述命令落地，但不在本篇提前定稿。
