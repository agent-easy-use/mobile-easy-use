# drive — MVP API 设计

[返回总览](README.md)

状态：drive MVP 模块已在本分支实现，尚未接入 SDK 根入口和类型声明；其余扩展仍为设计草案。drive 的输入和等待均返回 Promise。本文返回结构的新增细节为建议。 类型代码块用于描述签名和数据结构；`inspect.foo(...)`、`Test.create()` 等签名采用文档记法，不是可直接编译的完整 `.d.ts`。


## 1. API 概览

公开入口展平为六个方法，不保留 `drive.input.*`、`drive.wait.ui` 或 `drive.wait.until` 别名。仅调整调用层级，参数、返回值、线程调度和执行语义不变；内部仍按 input 与 wait 模块组织。

```javascript
drive.click(target)
drive.longPress(target)
drive.input(target, text)
drive.scroll(target, direction)

drive.wait(target, state, options)
drive.waitUntil(predicate, options)
```

## 2. 输入

输入目标见 [UI target：支持范围与平台定义](target.md)。涵盖 Android resource id/path/View/坐标，以及 iOS identifier/path/UIView/坐标。

定位范围、坐标单位、滚动方向、输入追加/替换语义由平台契约明确，不因方法同名而推断完全一致。

- 成功表示该输入操作达到其承诺的完成边界，不表示业务完成或页面正确。
- 定位失败、目标不可交互、注入失败需要明确报告，不静默切换到猜测坐标。
- 不自动重放完成状态未知的点击或文本输入。
- 临时事件和回调由 SDK 管理；输入超时不等于底层操作已取消。

结果沿用显式成功/失败风格：

```javascript
{ ok: true /* 操作相关结果 */ }
{ ok: false, error: { code, message } }
```

## 3. 等待

`drive.wait` 的 target 使用 [UI 查询目标](target.md#1-作用与支持范围)，Android 支持 resource ID、UI path 和原生 View，iOS 支持 identifier、UI path 和原生 UIView；不接受屏幕坐标。

```javascript
await drive.wait(searchField, 'visible', { timeoutMs: 5000 });
await drive.waitUntil(readRequestCompleted, {
  timeoutMs: 5000,
  intervalMs: 100,
});
```

UI 状态使用各平台支持的 `exists / visible / hidden / focused / enabled` 等值。等待失败保留最后一次检查错误；超时不取消已发出的业务请求。predicate 本身不结束的问题不能仅靠轮询超时解决，取消与超时边界需要另行明确。

等待用于同步进度，expect 用于判断正确性。例如等待“本次请求完成”，再断言“loading 已关闭”，避免把业务缺陷仅表现为等待超时。

## 4. 场景组合与 MVP 边界

```javascript
async function openSearch() {
  const clicked = await drive.click(searchEntry);
  if (!clicked.ok) return clicked;
  return drive.wait(searchField, 'visible', { timeoutMs: 5000 });
}
```

场景函数明确前置条件与完成承诺。drive 记录操作事实，但不强制失败截图或自动读取业务状态。

MVP 不新增通用 `drive.invoke()`、自动路径规划或 App 启停 API。已有原生桥接可用于直接业务调用，调用方遵守平台线程契约。


## 5. MVP 定义与参数

作用：封装真实输入和有界等待，让场景函数可以组合操作并判断执行失败。不会自动判断业务结果正确与否。

以下为平台无关的外形；[`InputTarget`、`UiTarget`](target.md) 按用途和平台分别定义，`Direction` 由平台声明定义。

```typescript
type Result<T> = Promise<T>;
interface OperationError {
  code: string;
  message: string;
  lastCheckError?: string;
}
type InputResult =
  | { ok: true; action: 'click' | 'longPress' | 'input' | 'scroll' }
  | { ok: false; action: 'click' | 'longPress' | 'input' | 'scroll'; error: OperationError };
type WaitResult = { ok: true } | { ok: false; error: OperationError };
interface WaitOptions { timeoutMs?: number; intervalMs?: number }

interface DriveApi {
  click(target: InputTarget): Result<InputResult>;
  longPress(target: InputTarget): Result<InputResult>;
  input(target: InputTarget, text: string): Result<InputResult>;
  scroll(target: InputTarget, direction: Direction): Result<InputResult>;
  wait(target: UiTarget, state: UiState, options?: WaitOptions): Result<WaitResult>;
  waitUntil(predicate: () => boolean | Promise<boolean>, options?: WaitOptions): Result<WaitResult>;
}
```

| API | 参数含义 | 返回 |
| --- | --- | --- |
| click | [target](target.md)：点击目标 | InputResult |
| longPress | [target](target.md)：长按目标；MVP 不增加时长参数 | InputResult |
| input | [target](target.md)：文本输入目标；text：输入字符串 | InputResult |
| scroll | [target](target.md)：手势区域；direction：平台支持的手指滑动方向 | InputResult |
| wait | [target](target.md)：查询目标；state：所需 UI 状态 | WaitResult |
| waitUntil | predicate：每次重新计算的布尔条件 | WaitResult |

等待默认值建议延续现有 `timeoutMs=5000`、`intervalMs=100`，均为正数。UI 查询目标不接受坐标和直接 View 实例，具体见 [target 支持范围](target.md#1-作用与支持范围)。

InputResult 是最小公共返回；坐标、注入方式等平台诊断字段可以扩展，逐个平台定稿。正常操作失败使用 `ok:false`；连接中断等无法取得结果的基础设施异常可以抛出/拒绝，不能误报为输入未发生。

## 6. 输入与等待示例

```javascript
const filled = await drive.input(searchField, 'phone');
if (!filled.ok) throw new Error(filled.error.message);

const submitted = await drive.click(searchButton);
if (!submitted.ok) throw new Error(submitted.error.message);

const ready = await drive.waitUntil(readRequestCompleted);
if (!ready.ok) throw new Error(ready.error.message);

const scrolled = await drive.scroll(resultsList, 'up');
if (!scrolled.ok) throw new Error(scrolled.error.message);

const pressed = await drive.longPress(resultItem);
if (!pressed.ok) throw new Error(pressed.error.message);
```

示例返回：

```javascript
{ ok: true, action: 'click' }
{ ok: false, action: 'click', error: { code: 'TARGET_NOT_FOUND', message: '目标未找到' } }
{ ok: false, error: { code: 'TIMEOUT', message: '等待条件未满足' } }
```

错误码示意需映射为实际平台契约。调用方检查每一步结果，不因 `await` 完成就假设成功。

## 7. 本分支实现说明

- Android/iOS 的 `drive/index.js` 各自导出 drive；根 `index.js` 的全局注册及根 `index.d.ts` 的声明留到所有新 API 完成后统一调整。现阶段通过测试直接加载模块。
- `drive.click / longPress / input / scroll` 内部负责 target 所需的主线程调度。Android 旧入口的调用线程契约不因新增入口而改变。
- 输入和等待在各平台 `drive/` 子目录中独立实现，元素查询与状态判断由同平台 `element/` 提供，保留全部平台结果与错误，不将结果裁剪为上文最小示意结构。iOS 不支持的参数不会因新入口而新增。
- Android 成功输入后保留现有 2000 ms settle delay；iOS 已解析输入响应保留现有 1000 ms 延时。这些固定延时不是业务完成保证。
- target 不新增解析语言或对象句柄，类型在各平台声明中独立定义。
- `drive.waitUntil` 不替 predicate 调度到 UI 线程；predicate 读取原生 UI 时仍需显式使用平台线程助手。
- 当前实现不新增 drive 证据事件管道；操作直接返回平台结果。证据关联随后续 inspect/运行时重构落地。

现有公开契约仍见 [Android index.d.ts](../../sdk/android/index.d.ts) 和 [iOS index.d.ts](../../sdk/ios/index.d.ts)；新 drive 契约待统一接入，当前以本文和独立模块测试为 review 依据。

### 实现目录边界

- `sdk/android/drive/`：input 执行、输入目标到触点/手势的转换和 wait。
- `sdk/ios/drive/`：input 执行及其目标/几何处理和 wait。
- `sdk/{android,ios}/element/`：`query.js` 负责元素查询，`state.js` 负责 UI 状态判断；各平台的 `target.js` 统一解析 ID 或 identifier/path/原生 View，返回 View 或 null，非法参数抛错；可供后续 inspect/test 使用，不依赖 drive。
- 新目录不引用旧 `exp/`、`input.js`、`wait.js`、`ui/` 或旧 input 专用 helper。迁移期间允许复制实现，旧 API 删除不会切断 drive 的模块依赖。
- 仅复用保留的底层基础设施：原生 bridge、线程调度、报告、通用几何及 Controller RPC；iOS 仍使用独立 XCTest Runner 后端。
