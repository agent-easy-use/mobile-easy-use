# 面向 Agent 的运行时 API

本文说明当前 SDK 的公开能力和组合方式。精确签名以 [Android 声明](../../sdk/android/index.d.ts) / [iOS 声明](../../sdk/ios/index.d.ts) 为准；双端根入口已导出新 API。设备覆盖和已知限制见各专项文档，不因接口存在而推定所有平台场景均已验证。

目标是让 Agent 探索 App、验证假设，并在实现完成后复用探查逻辑进行自动化断言。

| 分类 | 职责 |
| --- | --- |
| drive | 驱动到场景，等待所需状态 |
| inspect | 观测 UI、日志、方法及代码位置 |
| override | 配合 drive 构造依赖条件 |
| test / expect | 组织测试，断言取得的值 |

原生对象状态读取和 App 函数调用直接使用 Frida，可与上述能力组合。辅助入口为 element、common、runtimeStatus；Android 另有 Java、顶层 R，iOS 有 ObjC，common 额外提供 findClass。

## 返回与生命周期

- drive 六个方法均异步，返回带 ok 的操作/等待结果；失败 error 为含 code/message 的对象。
- inspect.ui 是异步直接读取；log/method/code 的 watch 返回只含 current/stop 的 watcher。两者异步返回 `{ok, data, error}`，data 是累计记录数组，error 为字符串或 null。
- override.method/field/code 异步返回异步 remove 闭包。调用方保存并在 finally 中清理；watcher 同样显式 stop。
- 普通函数组合场景，不要求 action wrapper、scope 或公共 registry。未来 CLI 如何管理跨调用句柄不属于当前公开 API。
- 清理只移除资源或恢复覆盖，不回滚业务副作用。具体保活、重复清理及平台限制见专项文档。
- iOS code 按需 attach，Host 在脚本销毁/断连时兜底 detach；Android debugger 底层在脚本卸载时兜底移除剩余断点。SDK 不公开 dispose。

## 返回给 Host / Agent

脚本返回值由传输层序列化，无需手动 stringify 普通对象。原生对象建议先提取所需 JSON 兼容数据；对象描述不等于业务状态，wrapper 不能作为跨进程可操作对象。

MCP eval/call 成功返回 `{result: value}`（undefined 统一为 null），异常返回 `{error: {message, stack}}`。MCP 同时提供 structuredContent 和对应 JSON 文本，异常时 isError 为 true。脚本返回的 `{ok: false}` 属于普通结果，需由调用方判断。旧 evidence 字段及聚合文件协议已移除；截图作为返回数据中的 filePath 使用。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [UI target](target.md) | 输入、UI 等待与截图的目标形式、定位规则及平台差异 |
| [drive](drive.md) | 输入、等待、场景组合与操作结果 |
| [inspect](inspect.md) | UI 采集设计入口与已 review 的日志、方法和代码位置观测概览 |
| [inspect.ui](inpsect-ui.md) | 状态谓词、元素树、布局、截图及使用示例 |
| [状态读取（Frida）](inpect-state.md) | 变量、对象字段与集合直接读取，不新增 inspect.state API，不包含 UI |
| [inspect.log](inpsect-log.md) | 异步 watch/current/stop、精简日志结果与平台边界 |
| [inspect.method](inspect-method.md) | 方法执行事实、enter／leave 状态提取、调用栈与平台边界 |
| [inspect.code Android](inpsect-code-android.md) | 代码位置观测、capture 配置、变量读取与 Java wrapper 生命周期 |
| [inspect.code iOS](inspect-code-ios.md) | LLDB 表达式采集、JSON 快照、调用栈与共享会话生命周期 |
| [override](override.md) | 共同签名、返回和撤销规则；[Android](override-android.md) / [iOS](override-ios.md) 分平台定义与示例 |
| [test / expect](test.md) | 用例组织、断言、执行报告 |

## 阅读约定

示例中的业务类、目标、辅助函数和 baseline 需要用项目实际定义替换。类型代码块用于说明契约，不一定是独立可编译的声明文件。专项调查文档保留其历史发现，不替代当前 SDK 类型契约。
