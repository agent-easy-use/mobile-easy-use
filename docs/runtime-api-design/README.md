# 面向 Agent 的运行时 API 设计

状态：MVP 设计草案，供 review；不代表当前 SDK 已实现。

目标：让 Agent 逐步探索 App、取得证据、验证假设，并在修改代码后复用探查代码进行自动化断言。脚本与未来 CLI 共用能力、资源生命周期和证据语义。

公开 API 分为四部分：

| 分类 | 职责 |
| --- | --- |
| `drive` | 驱动 App 执行操作、等待进入目标状态 |
| `inspect` | 获取 UI 状态、结构、布局与画面，以及日志、方法与代码位置的执行过程证据；非 UI 状态直接使用 Frida |
| `override` | 临时覆盖状态或行为，构造实验条件 |
| `test / expect` | 组织测试，并判断事实是否符合预期 |

共同约定：

- 移除以 action 为中心的强制封装。业务场景使用普通函数组合，不绑定采集与断言策略。
- 不要求调用方先创建 scope。持续资源具有独立身份，允许跨 CLI 调用管理；一次命令结束不代表资源结束。
- Android 与 iOS 分别维护类型契约，保留定位方式、原生值类型、表达式和线程限制的差异。
- 同步/异步逐项确定；inspect.log／method 已确定全部异步。其他示例中的 `await` 表达执行依赖，不表示所有接口已经确定返回 Promise。
- 代码块中的业务对象、定位函数、目标和 baseline 是项目提供的示意变量。
- 当前阶段先独立实现模块，两端根 `index.js` 和 `index.d.ts` 保持不变；所有新 API 完成后统一接入导出与类型声明。本文不替代最终类型声明。

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

各子文档包含作用、API 定义、参数、调用示例、返回与错误、生命周期和 MVP 边界。新增返回结构是本轮供 review 的建议，不代表已经确认或实现。

类型中的 `Result<T> = T | Promise<T>` 只表达同步/异步尚未定稿，最终 API 应给出确定类型，不以此联合类型作为实现目标。`JsonValue` 表示可独立保存的 JSON 数据；平台原生对象、原生表达式与类型转换按各平台契约定义。

## 实现前待确认项


| 项目 | 当前结论 / 待确认内容 |
| --- | --- |
| 异步 | inspect.log／method 已确定全部异步；其余逐 API 收敛 |
| 结果结构 | 确定返回可用于断言的事实；具体 envelope、时间字段和错误结构待定 |
| 持续采集预算 | 需要限制并报告截断；默认值、增量读取和 cursor 待定 |
| 调试器生命周期 | code watch/override 背后的 attach/detach 自动化待定 |
| 组合冲突 | 同方法/代码位置的观察与覆盖需定义兼容矩阵和执行顺序 |
| 字段恢复 | MVP 恢复原值；更细的竞争与恢复策略待定 |
| 测试入口 | Test.create 为现有能力延续提案，最终命名及图片 matcher 待 review |
| 迁移 | 在替换 action wrappers 前补齐资源注册、失败报告和跨调用证据收集 |

本文仅定义目标形态，不表示所有平台已支持所有组合。迁移应逐项核对实现、平台类型声明和设备验证结果。
