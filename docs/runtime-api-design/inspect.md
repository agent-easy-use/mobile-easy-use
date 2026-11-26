# inspect — MVP API 设计

[返回总览](README.md)

本文提供 inspect.ui 设计入口及已 review 的 log、method、code 能力概览，具体契约以各专项文档为准；不表示所有入口均已接入 SDK 根导出或完成真机验证。

此前关于状态读取、UI、证据组织及公共返回结构的未 review 草案已移除。变量、对象字段、集合等非 UI 状态直接使用 Frida 读取，见 [状态读取指南](inpect-state.md)，不新增 inspect.state API。UI 状态谓词、结构、布局和截图见 [inspect.ui 专项设计](inpsect-ui.md)。

## 1. API 概览

```javascript
inspect.log.watch(tags)
inspect.method.watch(definition, options?)
inspect.code.watch(definition, options?)
```

三类能力通过 watch 建立持续观测，通过 watcher.current() 读取已采集记录，通过 watcher.stop() 停止观测。watch／current／stop 均为异步；结果、原生值生命周期及停止行为分别遵循专项文档，不额外套用公共证据结构。

current() 读取已采集记录，不触发对 App 当前业务状态的重新读取。

## 2. log：日志持续观测

完整定义、返回值、平台差异和错误语义见 [inspect.log 专项设计](inpsect-log.md)。

```javascript
const watcher = await inspect.log.watch(['Search', 'Network']);
const current = await watcher.current(); // { ok, data: LogRecord[], error }
const finalResult = await watcher.stop();
```

watcher 只包含 current／stop，不暴露 id。结果中的 error 成功时为 null，失败时为错误消息字符串，不使用 error.code。LogRecord 只包含 timestamp、threadName、threadId、tag、level、message。watch 安装失败拒绝 Promise，current／stop 的运行错误通过结果表达。允许多个 log watcher 同时活动，TAG 可重叠；每个 watcher 独立缓存、注销和清理，共享原生监听器。

## 3. method：单个方法的执行观测

完整定义、记录结构、默认观测、错误和平台待确认项见 [inspect.method 专项设计](inspect-method.md)。

```javascript
const watcher = await inspect.method.watch(
  { className: 'com.example.SearchService', method: 'search', argumentTypes: ['java.lang.String'] },
  {
    enter: ({ receiver, args }) => ({ query: String(args[0]) }),
    leave: ({ receiver, args, result, exception }) => ({
      failed: exception !== undefined,
    }),
    stack: 10,
  },
);
const snapshot = await watcher.current(); // { ok, data: MethodRecord[], error }
const finalResult = await watcher.stop();
```

不提供 options 时记录调用身份、进入时间、线程、退出状态和耗时。一次调用对应一条记录，进入时创建、退出时更新；不提供独立 enter／return 事件。filter 位于 definition，只接收原方法参数。enter／leave 返回 `Record<string, any>` 信息合集，字段允许包含 Frida wrapper 等 JS 值，不要求 JSON 可序列化、不承诺深拷贝；原生引用由调用方显式保活和释放，不替换原方法结果。stop 不等待业务方法完成，未观察到退出的记录保留 running。

## 4. code：指定代码位置的观测

保留已 review 的平台专项设计作为唯一契约来源：

- [Android inspect.code](inpsect-code-android.md)：基于 JVMTI 的代码位置观测、capture 配置、同步 get 回调与 Java wrapper 生命周期。
- [iOS inspect.code](inspect-code-ios.md)：基于 Host LLDB 的代码位置观测、原生表达式采集、JSON 结果与调试会话生命周期。

method 关注方法边界，code 关注具体执行位置。变量修改与提前返回归 override。

本总览原有的 code 示例与类型已经过时，现移除重复定义，避免旧的 target／values／stack 结构覆盖专项文档中的 className／capture／stack 契约。两端的位置定义、值类型及执行上下文不能相互推断。

## 5. ui：状态、结构、布局与画面

完整设计与使用示例见 [inspect.ui 专项设计](inpsect-ui.md)。

```javascript
await inspect.ui.isExisting(target);
await inspect.ui.isVisible(target);
await inspect.ui.isHidden(target);
await inspect.ui.isFocused(target);
await inspect.ui.isEnabled(target);
await inspect.ui.tree(target, 3);
await inspect.ui.layout(target);
await inspect.ui.layoutInParent(target);
await inspect.ui.layoutInWindow(target);
await inspect.ui.layoutInScreen(target);
await inspect.ui.screenshotElement(target);
await inspect.ui.screenshotWindow();
await inspect.ui.screenshotElementInWindow(target);
```

状态谓词复用现有 UI_STATES 语义；tree 提供结构，layout 提供位置，screenshotWindow 提供窗口原图，screenshotElement 提供元素区域图片，screenshotElementInWindow 在目标所属窗口画面中高亮目标，结果可组合用于检查和展示。
