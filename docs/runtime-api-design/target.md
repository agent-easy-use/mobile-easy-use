# UI target — MVP 目标定义

[返回总览](README.md) · [drive](drive.md) · [inspect](inspect.md)

状态：当前双端公开 target 契约。以现有平台类型声明为能力基线，不因新入口同名而扩大支持范围。本文集中定义输入、UI 等待和截图的目标；不涉及 method/code 的原生方法或代码位置定义。

## 1. 作用与支持范围

`target` 描述操作或采集的目标。输入可以只需要一个屏幕位置，而 UI 等待和目标高亮截图需要能够解析到元素，因此三者不共用一个无限制的联合类型。

| 平台与目标形式 | drive.click / longPress / input / scroll | drive.wait | inspect.ui.screenshotElement / screenshotElementInWindow |
| --- | --- | --- | --- |
| Android resource id | 支持 | 支持 | 支持 |
| Android UI path | 支持 | 支持 | 支持 |
| Android 原生 View | 支持 | 支持 | 支持；高亮仅用于 screenshotElementInWindow |
| Android 坐标 `{ x, y }` | 支持 | 不接受 | 不接受 |
| iOS accessibilityIdentifier | 支持 | 支持 | 支持 |
| iOS UI path | 支持 | 支持 | 支持 |
| iOS 原生 UIView | 支持 | 支持 | 支持原生 UIView 对象 |
| iOS 坐标 `{ x, y }` | 支持 | 不接受 | 不接受 |
| 省略 target | 不接受 | 不接受 | target 必填；窗口原图使用 screenshotWindow() |

坐标不是元素定位规则；MVP 不新增截图区域矩形 target。截图范围也不等于整个设备屏幕。

建议优先使用稳定 id/identifier，其次使用有明确父节点的 path。原生 View 适合脚本中已定位到的对象；坐标适合没有稳定定位方式且已确认位置的输入。

### inspect.ui 的原生对象支持

[inspect.ui 设计](inpsect-ui.md) 中，状态谓词、tree、四个 layout 方法和两个接收 target 的截图方法均支持直接传入 Frida 原生对象：Android 使用实际运行时类型的 View wrapper，iOS 使用 UIView 的 ObjC.Object。tree 的每个节点通过 target 字段返回该对象，供继续检查或展开。

inspect.ui 已接入原生对象解析并同步平台类型声明。Android drive.wait 与 inspect 共用 element/target.js 的 resolveView；ID/path 每次轮询重新查找，原生 View 每次检查同一实例，不依赖聚焦窗口。有效但已脱离窗口的 View 仍满足 exists，visible 为 false。iOS drive.wait 同样共用本平台 element/target.js，identifier/path 每次重新查找，原生 UIView 检查同一实例。原生 target 指向具体实例；tree 引用的保活与释放规则见 [inspect.ui](inpsect-ui.md)。

## 2. Android 定义

以下类型仅属于 Android 声明环境：

```typescript
type AndroidUiPathStep =
  | `id::${number}`
  | `text::${string}`
  | `tag::${string}`
  | `class::${string}`
  | ((root: Java.Wrapper) => Java.Wrapper | null | undefined);
type AndroidUiPath = readonly [AndroidUiPathStep, ...AndroidUiPathStep[]];
interface AndroidScreenLocation { x: number; y: number }

type AndroidInputTarget = number | AndroidUiPath | Java.Wrapper | AndroidScreenLocation;
type AndroidUiTarget = number | AndroidUiPath | Java.Wrapper;
type AndroidScreenshotTarget = number | AndroidUiPath | Java.Wrapper;
```

`Java.Wrapper` 在这里必须表示有效 View，不能传任意 Java 对象。resource id 为正整数，例如 `R.id.search_button`，不是字符串 `"R.id.search_button"`。

### 定位规则

- id/path 在具有输入焦点的 Window 根节点内解析，不跨所有窗口搜索。
- path 为非空数组，每一步在上一步选中的 View 自身及其子树中查找；不回溯尝试其他分支。
- `id::` 后面是实际数值 id；`text::` 使用平台文本搜索，可能匹配子串；`tag::` 匹配字符串 tag；`class::` 匹配完整运行时类名并包含子类。
- getter 接收显式转换为实际类型的原生 Java wrapper，不使用 Proxy，也不自动提升其方法返回对象的类型；需要时调用方显式 `Java.cast`。
- getter 步骤同步返回 View 或 null/undefined，不接受 Promise；首次 getter 接收聚焦窗口根节点。回调的原生 UI 读取必须遵守平台线程要求。
- 找到元素不意味着可见或可交互。输入对 attached、shown、非空区域等继续校验；目标高亮截图使用 View 所属窗口。

### 调用示例

```javascript
await drive.click(R.id.search_button);

const target = [`id::${R.id.search_panel}`, 'text::Search'];
await drive.wait(target, 'visible');
const image = await inspect.ui.screenshotElementInWindow(target);

// searchButtonView 是项目已经定位到的原生 View。
await drive.longPress(searchButtonView);

// display 0 的绝对物理像素，不是 dp。
await drive.click({ x: 540, y: 900 });
```

坐标必须是有限非负数，目标显示器为 display 0；坐标绕过元素查找，不证明该点属于预期控件。不可直接把 dp 或缩放过的截图坐标作为输入坐标。

## 3. iOS 定义

以下类型仅属于 iOS 声明环境；实际 SDK 使用对应的 Objective-C bridge 类型：

```typescript
type IOSUiPathStep =
  | `identifier::${string}`
  | `label::${string}`
  | `class::${string}`;
type IOSUiPath = readonly [IOSUiPathStep, ...IOSUiPathStep[]];
interface IOSScreenLocation { x: number; y: number }

type IOSInputTarget = string | IOSUiPath | ObjC.Object | IOSScreenLocation;
type IOSUiTarget = string | IOSUiPath | ObjC.Object;
type IOSScreenshotTarget = string | IOSUiPath | ObjC.Object;
```

ObjC.Object 在 input 中必须是 UIView 实例。inspect.ui 各入口支持直接传入 UIView 对象，读取传入的实例。

### 定位规则

- 普通字符串始终表示 accessibilityIdentifier，即使包含 `::`，也不自动解释为 path 步骤。
- path 为非空数组；identifier/label 非空、区分大小写且精确匹配；class 使用完整运行时类名并包含子类。
- 每一步选择当前子树中第一个匹配 UIView，包含当前根节点；不回溯，也不默认报告多匹配歧义。使用足够明确的路径避免误选。
- 当前查询基线优先 key window，回退到首个未隐藏且满足 alpha 条件的窗口。输入还要求主屏幕前台 UIWindowScene，并执行可见区域、可交互性及触点命中校验。
- 不支持 Android 的 `text::`、`tag::` 或 getter path 步骤。
- 查询只覆盖 UIView；没有对应 UIView 的虚拟 accessibility/SwiftUI 元素不能假定可用 identifier/path 定位。

### 调用示例

```javascript
await drive.click('search.submit');

const target = ['identifier::search.panel', 'label::Search'];
await drive.wait(target, 'visible');
const image = await inspect.ui.screenshotElementInWindow(target);

// searchButtonView 是项目已经定位到的原生 UIView。
await drive.longPress(searchButtonView);

// 当前界面方向下的主屏幕绝对 points，不是图片 pixels。
await drive.click({ x: 180, y: 320 });
```

坐标必须有限并处于前台场景 key window 的可见范围。不得直接把截图像素当作 points；需要已知 scale 和坐标变换。输入预检查不覆盖其他进程的系统窗口，也不能保证解析后 UI 不移动。

## 4. 解析时机、失败与生命周期

- 每次 API 调用重新解析 id/identifier/path；drive.wait 在每次检查时重新解析。因此页面重建后规则可以解析到新实例。
- 直接传 View/UIView 指向固定实例，不自动替换为重建后的对象；不应将它长期当作稳定页面身份。
- 目标缺失或不可操作时，输入返回操作失败；具体 code 由平台定义。Android drive 的 id/path 统一交给 findUiView；无聚焦窗口或无匹配元素均返回 VIEW_NOT_FOUND，输入层不单独枚举窗口。
- drive.wait 的目标暂时缺失通常表示条件未满足，继续等待。`hidden` 要求元素存在且不可见，不等于元素不存在。非法参数/查询异常的重试与超时规则以 wait 契约为准。
- screenshotElementInWindow(target) 使用目标所属窗口，并在窗口图片中高亮目标；target 必填。screenshotWindow() 单独采集当前 App 窗口原图。screenshotElement(target) 返回元素区域的独立图片，复用原生窗口绘制与裁剪，不加高亮。目标解析、窗口采集或高亮失败时明确报告。
- target 本身不是新建的持久资源，不返回清理句柄。调用方自行 retain 的原生对象仍由调用方负责释放；不要把普通 target 参数理解为自动长期 retain。
- 输入完成不代表业务完成；目标解析也不代表整个执行过程获得一致快照。

## 5. 未来 CLI 表示

数值、字符串、纯字符串数组和 `{ x, y }` 可以序列化传输，具体命令参数形式另行定义。原生 View/UIView 和 Android getter 函数不能直接作为 JSON target 传输；可在脚本中使用，不承诺 CLI 自动还原。MVP 不为了 CLI 新增全局原生对象句柄系统。

## 6. 与当前实现的关系

本文沿用当前目标类型与解析能力；`drive.*` 已在本分支实现，元素定位在各平台 element 子目录中独立维护，输入专属的触点与手势处理保留在 drive/input；`inspect.ui.screenshotWindow()` 与 `inspect.ui.screenshotElementInWindow(target)` 已在双端独立 inspect 模块实现，使用原生窗口采集及 Host 图片处理。

类型契约基线：[Android index.d.ts](../../sdk/android/index.d.ts)、[iOS index.d.ts](../../sdk/ios/index.d.ts)。本目录其他文档仅引用本文的 target 范围，不再各自维护不一致的支持表。
