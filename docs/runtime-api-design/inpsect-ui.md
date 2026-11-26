# inspect.ui — MVP API 设计

[返回 inspect](inspect.md) · [返回总览](README.md) · [UI target](target.md)

状态：双端独立 inspect 模块已实现 ui，复用现有 UI_STATES 检查逻辑。根 SDK / 全局入口的统一接入沿用 inspect 总体迁移安排。

## 1. 作用与 API

围绕给定 target 获取 UI 信息，支持 Agent 探索、人类检查与测试断言：状态谓词判断目标当前条件，tree 描述组成结构，layout 描述位置与尺寸，screenshotWindow 提供窗口原图，screenshotElement 提供元素区域图片，screenshotElementInWindow 在目标所属窗口画面中高亮目标。

| 分类 | API | 回答的问题 |
| --- | --- | --- |
| 状态 | isExisting / isVisible / isHidden / isFocused / isEnabled | 目标当前是否满足指定条件？ |
| 结构 | tree | 目标由哪些元素组成，父子关系是什么？ |
| 布局 | layout / layoutInParent / layoutInWindow / layoutInScreen | 目标在哪里，占据多大空间？ |
| 画面 | screenshotElement / screenshotWindow / screenshotElementInWindow | 当前窗口是什么画面，目标区域在哪里？ |

```typescript
// API 签名记法；PlatformUiTarget、PlatformScreenshotTarget 分平台定义。
inspect.ui.isExisting(target: PlatformUiTarget): Promise<boolean>;
inspect.ui.isVisible(target: PlatformUiTarget): Promise<boolean>;
inspect.ui.isHidden(target: PlatformUiTarget): Promise<boolean>;
inspect.ui.isFocused(target: PlatformUiTarget): Promise<boolean>;
inspect.ui.isEnabled(target: PlatformUiTarget): Promise<boolean>;

inspect.ui.tree(target: PlatformUiTarget, depth?: number): Promise<PlatformUITreeNode>;
inspect.ui.layout(target: PlatformUiTarget): Promise<PlatformLocalLayout>;
inspect.ui.layoutInParent(target: PlatformUiTarget): Promise<PlatformRelativeLayout>;
inspect.ui.layoutInWindow(target: PlatformUiTarget): Promise<PlatformRelativeLayout>;
inspect.ui.layoutInScreen(target: PlatformUiTarget): Promise<PlatformRelativeLayout>;
inspect.ui.screenshotWindow(): Promise<UIScreenshot>;
inspect.ui.screenshotElementInWindow(target: PlatformScreenshotTarget, highlight?: boolean): Promise<UIScreenshot>;
```

PlatformUITreeNode 使用第 4 节的平台节点类型；UIScreenshot 使用第 6 节的返回类型。PlatformLocalLayout、PlatformRelativeLayout 分别使用第 5 节的 Android 或 iOS 类型。所有入口均为异步，SDK 负责 UI 线程调度；每次调用执行一次检查或采集，持续等待通过 drive.wait 完成。

## 2. target：指定被检查的元素

定位由已有 element / target 能力负责，inspect.ui 使用其解析结果。现有平台基线见 [UI target](target.md)：

- Android 各 inspect.ui 入口使用 resource id、UI path 或 Frida 原生 View wrapper。
- iOS 各 inspect.ui 入口使用 accessibilityIdentifier、UI path 或 Frida 原生 UIView 对象。
- tree 返回的节点 target 可直接传入状态谓词、tree、四个 layout 方法及 screenshot。

screenshotWindow() 使用当前 App 窗口；screenshotElementInWindow(target) 要求显式传入高亮目标，并使用该目标所属窗口。

id / identifier / path 在每次调用时重新解析；解析范围和匹配规则遵循各平台定位契约。直接传入原生对象时读取该实例。Android 节点 target 为实际运行时类型的 Java.Wrapper，iOS 为底层 UIView 的 ObjC.Object；Android tree 直接返回 Java.cast 创建的 wrapper，由 Frida GC 管理；调用方也可通过 $dispose() 提前释放包装引用。iOS tree 返回由 UI 层级持有的 ObjC.Object；跨越视图移除继续持有时，调用方自行配对 retain()/release()。

## 3. 状态谓词

### 3.1 返回与错误

五个状态谓词均返回 boolean：满足条件返回 true，否则返回 false。目标缺失时五项均返回 false，包括 isHidden。参数非法、定位执行异常或原生 getter 读取异常拒绝 Promise。

### 3.2 状态语义

| API | 语义与平台规则 |
| --- | --- |
| isExisting | 在约定查找范围内解析到目标元素 |
| isVisible | 通过平台挂载、显示属性、透明度及几何区域检查 |
| isHidden | 目标存在，且 isVisible 为 false |
| isFocused | Android 读取目标自身 isFocused()；iOS 读取 isFirstResponder()，表示输入焦点口径 |
| isEnabled | 读取目标自身的启用或交互开关，见下表 |

| 平台 / 类型 | enabled 判断 |
| --- | --- |
| Android View | isEnabled() |
| iOS 普通 UIView | isUserInteractionEnabled() |
| iOS UIControl | isUserInteractionEnabled() && isEnabled() |

isEnabled 仅检查目标自身的上述开关。祖先交互限制、可见性、触摸命中以及 scrollEnabled 等特定操作属性属于各自的判断范围。

### 3.3 visible 的现有判定范围

Android 检查：

- 已附着到窗口，isShown() 为 true，窗口 visibility 为 VISIBLE。
- 自身及祖先累乘 alpha 大于 0.01。
- getGlobalVisibleRect() 成功，转换后的区域与窗口可见显示区域相交。

iOS 检查：

- 存在所属窗口，自身 bounds 宽高大于零。
- 自身及祖先均未隐藏，累乘 alpha 大于 0.01。
- 转换后的区域与窗口、屏幕相交，并经过 clipsToBounds 祖先裁剪后仍有正面积。

这里的 visible 表示通过显示属性与几何检查。兄弟元素或其他窗口的遮挡、复杂 mask 与呈现层动画几何尚不在当前检查范围内。hidden 表示“存在但未通过该检查”；focused 使用原生输入焦点事实，与选中状态、无障碍焦点分别解释。

### 3.4 使用示例

```javascript
// Android：路径中的类名、文本应替换为 App 实际值。
const target = ['class::android.widget.Button', 'text::提交'];
const exists = await inspect.ui.isExisting(target);
const visible = await inspect.ui.isVisible(target);
const enabled = await inspect.ui.isEnabled(target);
console.log({ exists, visible, enabled });
```

```javascript
// iOS：普通字符串表示 accessibilityIdentifier。
const target = 'search.input';
const focused = await inspect.ui.isFocused(target);
const hidden = await inspect.ui.isHidden(target);
console.log({ focused, hidden });
```

### 3.5 与 wait 和断言共用语义

| 单次检查 | drive.wait 的状态 | 测试断言 |
| --- | --- | --- |
| isExisting(target) | exists | expect(await inspect.ui.isExisting(target)).toBe(true) |
| isVisible(target) | visible | expect(await inspect.ui.isVisible(target)).toBe(true) |
| isHidden(target) | hidden | expect(await inspect.ui.isHidden(target)).toBe(true) |
| isFocused(target) | focused | expect(await inspect.ui.isFocused(target)).toBe(true) |
| isEnabled(target) | enabled | expect(await inspect.ui.isEnabled(target)).toBe(true) |

三者共用底层状态检查器。inspect 检查一次；wait 根据自己的轮询、重试与超时契约重复检查；测试断言将检查结果转为断言结果。

```javascript
const target = 'form.submit'; // iOS identifier
await drive.wait(target, 'enabled');
const enabled = await inspect.ui.isEnabled(target);
// enabled 是这次重新读取的结果，可直接用于业务判断或断言。
```

## 4. tree：读取组成结构

返回以 target 为根的节点，保留实际父子关系。每个节点包含 className、target、bounds、children 四个字段。

```typescript
// Android
interface AndroidUITreeNode {
  className: string;
  target: Java.Wrapper; // 底层为 View，包装为实际运行时类型
  bounds: AndroidUIRect; // 自身局部坐标，px
  children: AndroidUITreeNode[];
}

// iOS；实际声明使用对应 Objective-C bridge 类型。
interface IOSUITreeNode {
  className: string;
  target: ObjC.Object; // 底层为 UIView
  bounds: IOSUIRect; // UIView.bounds 换算为 px
  children: IOSUITreeNode[];
}
```

- className 为原生运行时类名，便于对照标准控件和自定义控件代码。
- target 是本次遍历取得的原生对象，可直接用于后续 UI 检查。
- bounds 为节点自身的局部范围，使用 px，与 layout(target).bounds 一致；iOS 通过所属窗口屏幕的 scale 换算，因此要求节点已关联窗口。根节点及深度边界节点也包含 bounds，不附加 unit、density 或 scale 字段。
- children 为本次实际展开的直接子节点，按平台子节点遍历顺序排列。
- depth 控制遍历深度，默认 3，合法范围为 0～64 的整数；根节点深度为 0，depth=0 仅返回根节点。
- 达到 depth 限制时 children 返回空数组；空数组仅说明本次没有展开的子节点，也可能来自实际叶子节点。调用方可对该节点 target 再次调用 tree 继续探索。
- Android 遍历 View 层级，iOS 遍历 UIView 层级。
- 目标缺失或采集失败时拒绝 Promise。

返回示意：

```javascript
{
  className: 'android.widget.LinearLayout',
  target: rootView,
  bounds: { x: 0, y: 0, width: 1080, height: 600 },
  children: [
    {
      className: 'android.widget.EditText',
      target: inputView,
      bounds: { x: 0, y: 0, width: 960, height: 120 },
      children: []
    },
    {
      className: 'com.example.ResultContainer',
      target: resultView,
      bounds: { x: 0, y: 0, width: 960, height: 360 },
      children: []
    }
  ]
}
```

rootView、inputView、resultView 表示 Frida 原生 View wrapper。使用示例：

```javascript
const root = await inspect.ui.tree(target, 2);
const child = root.children[0];
if (child) {
  const layout = await inspect.ui.layoutInParent(child.target);
  const enabled = await inspect.ui.isEnabled(child.target);
  const image = await inspect.ui.screenshotElementInWindow(child.target);
  const subtree = await inspect.ui.tree(child.target, 2);
}
```

className 与 children 描述采集时的结构；target 是活对象引用，通过它继续读取取得的是后续状态。保活与释放规则分平台确定。

## 5. layout：读取位置与尺寸

布局信息用于对照代码、独立分析目标尺寸、父子布局、边距、居中和空间占比。调用方按问题选择一个坐标空间。

### 5.1 方法与坐标空间

| API | bounds | targetBounds |
| --- | --- | --- |
| layout(target) | 目标在自身坐标系中的边界 | — |
| layoutInParent(target) | 直接父容器在自身坐标系中的范围 | 目标转换到父容器坐标系后的矩形 |
| layoutInWindow(target) | 所属窗口在自身坐标系中的范围 | 目标转换到窗口坐标系后的矩形 |
| layoutInScreen(target) | 所属屏幕坐标系中的屏幕范围 | 目标转换到该屏幕坐标系后的矩形 |

相对布局同时提供参照区域和目标矩形，可以直接计算边距、居中偏差及尺寸比例。窗口范围表示完整窗口区域，坐标原点按窗口坐标系解释；safe area / 系统 Insets 使用各自的平台定义。

### 5.2 返回结构

```typescript
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Android
interface AndroidLocalLayout {
  bounds: Rect;
  unit: 'px';
  density: number;
}
interface AndroidRelativeLayout extends AndroidLocalLayout {
  targetBounds: Rect;
}

// iOS
interface IOSLocalLayout {
  bounds: Rect;
  unit: 'px';
  scale: number;
}
interface IOSRelativeLayout extends IOSLocalLayout {
  targetBounds: Rect;
}
```

- 双端所有矩形统一使用 px，同一返回值内的矩形使用相同坐标空间与单位。
- Android 保留原生像素几何，density 使用目标资源上下文的 DisplayMetrics.density；逻辑尺寸换算为 dp = px / density。
- iOS 先在 UIKit 坐标系中完成转换，再以目标所属屏幕的 scale 将 pt 转为 px；逻辑尺寸换算为 pt = px / scale。这里采用 UIScreen.scale，区别于表示物理屏幕缩放的 nativeScale。
- 本地 bounds 保留实际坐标原点；Android 按 View 的本地坐标定义，iOS 按 UIView.bounds 定义。父容器 bounds 也保留其自身坐标原点。
- 相对布局返回目标完整边界转换后的轴对齐包围矩形，包括坐标转换中的平移、缩放和旋转效果。裁剪与遮挡不改变该几何矩形。
- 坐标允许负数，像素数允许小数，宽高可为零。结果保留计算精度，展示时由调用方按需取整。
- 目标缺失，或所需父容器、窗口、屏幕及单位转换信息无法取得时，拒绝 Promise。

### 5.3 使用示例

```javascript
const own = await inspect.ui.layout(target);
// Android 示例：
// {
//   bounds: { x: 0, y: 0, width: 360, height: 144 },
//   unit: 'px', density: 3
// }
const widthDp = own.bounds.width / own.density;
```

```javascript
const parent = await inspect.ui.layoutInParent(target);
// Android 示例：
// {
//   bounds: { x: 0, y: 0, width: 1080, height: 600 },
//   targetBounds: { x: 60, y: 30, width: 360, height: 144 },
//   unit: 'px', density: 3
// }
const leftGap = parent.targetBounds.x - parent.bounds.x;
const rightGap = parent.bounds.x + parent.bounds.width
  - parent.targetBounds.x - parent.targetBounds.width;
console.log({ leftGap, rightGap });
```

```javascript
const windowLayout = await inspect.ui.layoutInWindow(target);
// iOS 示例：
// {
//   bounds: { x: 0, y: 0, width: 1170, height: 1800 },
//   targetBounds: { x: 60, y: 300, width: 360, height: 144 },
//   unit: 'px', scale: 3
// }
const widthPt = windowLayout.targetBounds.width / windowLayout.scale;
```

```javascript
const screenLayout = await inspect.ui.layoutInScreen(target);
// iOS 示例：
// {
//   bounds: { x: 0, y: 0, width: 1170, height: 2532 },
//   targetBounds: { x: 60, y: 500, width: 360, height: 144 },
//   unit: 'px', scale: 3
// }
```

示例窗口与屏幕位置仅用于说明坐标空间；实际值由目标所属窗口和屏幕决定。

## 6. screenshotElement / screenshotWindow / screenshotElementInWindow

### 6.1 API 与采集范围

| API | 语义 |
| --- | --- |
| screenshotElement(target) | 返回目标元素区域的独立图片，复用旧原生截图实现，不加标注 |
| screenshotWindow() | 采集当前 App 窗口的原始画面 |
| screenshotElementInWindow(target, highlight = true) | 采集目标所属窗口的画面，并在图片中高亮目标区域 |

```javascript
const elementImage = await inspect.ui.screenshotElement(target);
const windowImage = await inspect.ui.screenshotWindow();
const highlightedImage = await inspect.ui.screenshotElementInWindow(target); // highlight 默认 true
const originalImage = await inspect.ui.screenshotElementInWindow(target, false); // 目标所属窗口原图
```

screenshotElementInWindow 的 target 必填，支持各平台已有定位形式及 Frida 原生 View / UIView。target 表示关注并高亮的元素；最终图片保留其所属窗口的完整上下文，图片尺寸由窗口采集范围决定。

screenshotWindow 的“当前窗口”沿用 Android findFocusedRootView / iOS MEUUIQuery.focusedWindow 的选择规则。screenshotElementInWindow 通过解析后的元素取得所属窗口。返回信息说明实际窗口范围。

### 6.2 元素图片的实现边界

`screenshotElement(target)` 必须提供 [UI target](target.md)，返回与窗口截图相同的 `UIScreenshot` 结构，`highlight` 为 null。缺失、隐藏、无尺寸或未得到有效元素图片时拒绝 Promise。

复用当前原生实现：Android 先 `root.draw(Canvas)` 再裁剪；iOS 先 `drawViewHierarchy` 再裁剪。两端均从目标所在窗口采集，裁剪范围限制在窗口内。它不是绕过窗口独立绘制 View，不会去除覆盖在目标区域上的其他视图。Android 沿用原实现的位置和宽高裁剪规则，不新增旋转、缩放裁剪算法。

`sourceBounds` 是原生返回的实际裁剪矩形，位于窗口截图坐标系中；`region` 是对应屏幕范围，均统一为像素。窗口内其他视图的遮挡、系统和独立 Surface 的限制沿用旧实现。调用不修改 App 视图层级。

### 6.3 高亮方式与处理流程

高亮在窗口图片上绘制，App 内负责采集窗口及目标几何信息，Host 负责生成标注图片：

1. 在 UI 线程解析 target，取得所属窗口及目标在窗口中的边界。
2. 采集窗口画面，记录实际图片尺寸和窗口坐标到图片像素的转换依据。
3. Host 将目标边界映射到图片坐标，在图片副本上绘制红色矩形虚线及白色描边。
4. 输出保留窗口上下文的高亮图片。

边框内部保留原始画面细节。目标部分超出窗口时，只绘制图片范围内的高亮区域；靠近图片边缘的线条向内绘制。旋转目标按转换后的轴对齐包围矩形标注。

高亮表达目标的几何位置。同窗口中其他元素对目标的遮挡保留在采集画面中，标注帮助调用方观察该位置及其上下文。

Host 可复用已有 jpeg-js / pngjs：将窗口图片解码为 RGBA，绘制矩形边框，再编码为 PNG。图片标注在 Host 完成，App 的视图层级保持采集时的状态。

### 6.4 返回与错误

返回图片产物及解释图片所需的信息：图片像素尺寸、实际窗口采集区域、坐标映射依据和采集时间。screenshotElementInWindow 的结果还应说明实际高亮区域。图片保存在当前 Host 会话的 evidenceDirectory/screenshots 下，返回绝对路径。

```typescript
interface UIScreenshot {
  filePath: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  unit: "px";
  region: UIRect;       // 实际采集区域在屏幕中的范围（窗口或元素区域）
  sourceBounds: UIRect; // 采集范围在窗口自身坐标系中的矩形
  highlight: UIRect | null; // 输出图片中的实际高亮像素区域；原图为 null
  capturedAt: string;   // 开始采集时的 ISO 时间
  captureMethod: "view-draw" | "draw-view-hierarchy";
}
```

窗口坐标到图片坐标的映射：`imageX = (windowX - sourceBounds.x) * width / sourceBounds.width`，Y 同理。highlight 默认为 true，设为 false 时保留目标所属窗口原图，highlight 为 null。高亮采用向内的红色虚线与白色外线，输出 PNG。总线宽为 Android 2 dp / iOS 2 pt（包含 0.5 dp / pt 白色描边），虚线段长 6 dp / pt、间隔 4 dp / pt。分别使用窗口的 Android density / iOS UIScreen.scale 换算为图片像素并取整，与窗口图片宽度无关。

- screenshotWindow 交付窗口原图；screenshotElementInWindow 交付带目标高亮的窗口图片。
- 目标不存在、所属窗口不可用，或采集/标注失败时拒绝 Promise；开启高亮时，目标与采集范围没有有效交集也拒绝 Promise。
- Android 使用窗口根 View.draw(Canvas)，iOS 使用窗口 drawViewHierarchy。采集目标窗口的视图层级；系统浮层、其他窗口以及独立 Surface 的合成内容不保证包含。
- 窗口几何与画面在 UI 线程相邻采集，capturedAt 标记开始时间；动画期间仍可能发生变化。

### 6.5 从 tree 节点继续查看

```javascript
const root = await inspect.ui.tree(target, 2);
const child = root.children[0];
if (child) {
  const image = await inspect.ui.screenshotElementInWindow(child.target);
  // image 是 child 所属窗口的画面，其中 child 的区域已高亮。
}
```

## 7. 结构、布局与画面的对应

三个结果通过节点 target 和空间信息组合使用：

1. tree(root) 获得结构与节点 target。
2. layoutInScreen(nodeTarget) 取得关心节点在屏幕坐标系中的位置。
3. screenshotWindow() 提供当前窗口原图和坐标转换依据；组合时核对节点所属窗口与采集窗口。
4. 展示层将节点位置映射到图片像素，生成边框、编号或高亮。

```javascript
const structure = await inspect.ui.tree(rootTarget, 3);
// 此例选择根节点；也可从 structure.children 中选择后代。
const nodeTarget = structure.target;
const geometry = await inspect.ui.layoutInScreen(nodeTarget);
const picture = await inspect.ui.screenshotWindow();
// 确认采集窗口与节点所属窗口一致后，使用 geometry.targetBounds
// 和 picture 的采集区域/缩放信息进行映射。
```

rootTarget 是调用方提供的目标，nodeTarget 是树节点中的原生对象。返回结构必须提供足够的信息完成映射，避免调用方猜测窗口偏移、截图裁剪与缩放比例。

## 8. 时间与生命周期

每次调用采集当前结果，后续 App 变化不回写已取得的状态值、结构描述、几何数据或图片。tree 中用于继续访问的节点 target 按其独立生命周期使用。

分开调用可能跨越布局变化或动画阶段，调用方按需要重新采集；需要记录时间区间时，可在调用前后记录时间。普通采集结果直接交付调用方；原生引用遵循第 2 节的管理规则，图片作为 Host 会话证据文件保存。

## 9. 实现与验证

双端 JS 模块位于 `sdk/{android,ios}/inspect/ui/`，通过 Frida 读取平台对象，在主线程采集。iOS 原生截图桥接提供指定窗口采集，Host 负责图片保存和高亮。

ApiDemo 端到端用例位于 `fixtures/{android,ios}/ApiDemo/tests/inspect/ui.js`，测试准备阶段创建真实原生视图，结束后清理。覆盖状态、原生节点复用、深度边界、坐标转换、变换、窗口截图、目标高亮及异常目标。

```bash
npm run test:e2e -- --platform android --suite inspect/ui
npm run test:e2e -- --platform ios --suite inspect/ui
```

iOS 需先构建包含新截图桥接的 MobileEasyUse.dylib 和 ApiDemo。测试入口安装预构建 App；详细要求见 [E2E README](../../test/e2e/README.md)。

平台契约分别维护于 [Android index.d.ts](../../sdk/android/index.d.ts) 与 [iOS index.d.ts](../../sdk/ios/index.d.ts)，目标定义统一维护于 [target.md](target.md)。

## 10. 截图断言

`Test` 由平台入口注入 `inspect.ui` 截图能力，公共 expect 模块不直接引用平台模块。

```javascript
await expect(target).toMatchElementScreenshot(elementBaseline);
await expect().toMatchWindowScreenshot(windowBaseline);
```

两个断言分别调用 `screenshotElement` 和 `screenshotWindow`，取返回的 `filePath` 交给 Host 图片比较，不使用带标注图片。采集错误直接传播，包括 `.not` 情况。旧 `screenshot(target)`、`toHaveElementScreenShot` 和 `toHaveWindowScreenShot` 不再保留。
