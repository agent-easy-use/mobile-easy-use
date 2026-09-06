# mobile-easy-use iOS SDK

首版 iOS Frida SDK 运行在被测 App 进程中，提供 Objective-C Runtime 初始化、UIKit
查询与等待、以及 action-scoped 状态/UI/方法链证据。UI 查找由宿主编译的
Objective-C `MEUUIQuery` 类执行，JS 只负责传递路径参数。它不提供 XCTest、真实触摸注入或
通用 Swift Runtime Hook。

## Build

SDK 使用 `frida-objc-bridge`，需要通过 `frida-compile` 打包：

```bash
npm run build:ios
```

Frida 17 之后不再内置语言 Bridge，因此不能直接把未打包的 `index.js` 加载到 Runtime。
Objective-C native bridge 不再编译进宿主 App：`MEUUIQuery` 和 `MEULog` 位于独立的
`MobileEasyUse.dylib`。App 构建时只 embed 它及其 `MobileEasyUseRuntime.dylib` 依赖；LLDB attach
后加载 bridge，dyld 再加载 Runtime。未完成该加载时，目标侧 UI 与 Evidence API 会明确报告
native bridge 不可用；Input 由独立 XCTest Runner 执行。

## Runtime

加载 bundle 后会安装三个 global：

- `ObjC`: `frida-objc-bridge`
- `IOS`: 主队列调度、UIKit 查询与等待
- `Probe`: action-scoped evidence

同时安装 RPC：

- `runtimeStatus()`
- `loadPresetBundle(modulePath, source)`
- `callFunction(modulePath, source, functionName, args)`
- `evalScript(scriptName, source)`

直接调用要求主队列的 UIKit API 时，可以使用统一封装并等待结果：

```js
const title = await IOS.runOnMainThread(() => view.title());
```

## UI

`IOS.ui.find()` 同步返回查询结果；Native `MEUUIQuery` 会在需要时同步切到 main queue。
`IOS.wait.ui()` 通过 Promise 执行轮询，每次状态查询的线程切换同样由 `MEUUIQuery` 负责：

```js
const button = IOS.ui.find('meu.counter.increment');

const nested = IOS.ui.find([
  'label::Counter',
  'identifier::meu.counter.increment',
]);

const visible = await IOS.wait.ui(
  'meu.counter.increment',
  'visible',
  { timeoutMs: 5000 },
);
```

`IOS.wait.ui()` 每次轮询都调用 Native `MEUUIQuery.stateForUIViewPath:`；JavaScript 只负责
定时器和超时，不读取或遍历 UIKit 对象。当前等待目标是 identifier 或 Native UI path，
状态支持 `exist`、`visible`、`gone`。

## Input

输入由独立的 `MEUStandaloneRunner` 通过 XCTest 执行，产生真实触摸和键盘事件。目标进程的
`IOS.input` 通过已有 `requestController` 把纯数据请求发给 Host；Host 的内部
`ios-controller` 再把请求转给 Runner 的独立 Frida Session：

```js
await IOS.input.click('meu.counter.increment');
await IOS.input.input([
  'identifier::meu.counter.form',
  'identifier::meu.counter.input',
], 'hello');
await IOS.input.scroll('meu.counter.list', 'up', 300);
await IOS.input.click({ x: 120, y: 360 });
await IOS.input.click(IOS.ui.find('meu.counter.increment'));
```

Host 在 iOS `connect` 校验目标 App runtime 后启动当前 connection 唯一的 Runner。
`runtimeStatus()` 只报告目标 App SDK 状态；`IOS.input` 不感知 Runner 的身份和生命周期。

identifier 与 label 路径由 XCTest Accessibility Tree 查询；显式 `{x, y}` 使用绝对屏幕
point 坐标；传入 `UIView` 时，目标进程在主线程读取其屏幕中心点，再把纯坐标交给 Runner。
四个 Input API 都会在最后一个 XCTest action 返回后再等待 1000 ms，随后 Promise
才会完成，使页面导航、键盘输入和动画有固定的稳定时间。

路径支持：

- `identifier::<accessibilityIdentifier>`
- `label::<accessibilityLabel>`
- 不支持 JavaScript getter；需要特殊路径时应在 Native `MEUUIQuery` 中增加查询类型

每一步都从上一步得到的 UIView 子树继续搜索。遍历、匹配和 10,000 个 UIView 的限制全部
由 Objective-C `MEUUIQuery` 实现，JavaScript 只负责传递路径数组。

## Evidence

三种 Evidence 都固定返回 Promise，并等待 action 和最终清理完成。State getter 保持同步：

```js
return await Probe.evidence.withStateEvidence(
  () => model.increment(),
  'Increment counter',
  { count: () => Number(model.count()) },
);
```

UI 证据需要 main queue，固定返回 Promise：

```js
return await Probe.evidence.withUiEvidence(
  async () => performBusinessAction(),
  'Increment counter',
  { button: 'meu.counter.increment' },
);
```

Objective-C 方法链使用精确的 class + selector，并且只观察、不替换实现：

```js
return await Probe.evidence.withChainEvidence(
  () => performBusinessAction(),
  'Increment counter',
  undefined,
  [{ target: 'CounterModel', selector: '- increment' }],
);
```

日志证据只观察 `NSLog`。format 可以使用静态 `[TAG] `，也可以使用动态 `[%@]` 前缀：

```swift
NSLog("[Network] request failed: %@", error.localizedDescription) // 可采集
NSLog("[%@]request failed", "Network")                           // 可采集
```

动态形式要求第一个可变参数是与目标 TAG 精确匹配的 `NSString`。replacement 会保留原始
`NSLog` 的 format、参数和系统输出。Evidence 的 `tag` 字段和 `message` 中的 `[TAG]`
前缀都会保留。`withChainEvidence` 的第三个参数是一项 TAG 或 `Set<string>`，第四个参数是方法 Hook。

日志和方法 Hook 依赖 Frida `Interceptor`。在受限 iOS code-signing 模式下 Interceptor 可能不可用，
此时 `withChainEvidence` 会在执行 action 前明确失败，State/UI Evidence 仍可独立使用。

Evidence 以 `@@MOBILE_EVIDENCE@@` 开头写入 console，与 Android 侧聚合格式兼容。

## Scope

当前 Native UI 查询遍历 UIKit `UIView` hierarchy。SwiftUI 的语义元素不保证对应独立 UIView，
因此首版不承诺通过 accessibility identifier 找到所有 SwiftUI 元素。业务状态与方法探测
建议优先选择 `NSObject` / `@objc dynamic` 边界。
