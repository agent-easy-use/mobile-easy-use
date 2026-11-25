# drive — MVP API 设计

[返回总览](README.md)

状态：双端已通过根入口导出，输入和等待均返回 Promise。精确结果及错误码见平台 index.d.ts；本文类型为简化签名。

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

定位范围、坐标单位、滚动方向、文本追加语义由平台契约明确，不因方法同名而推断完全一致。

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
  click(target: InputTarget): Promise<InputResult>;
  longPress(target: InputTarget): Promise<InputResult>;
  input(target: InputTarget, text: string): Promise<InputResult>;
  scroll(target: InputTarget, direction: Direction): Promise<InputResult>;
  wait(target: UiTarget, state: UiState, options?: WaitOptions): Promise<WaitResult>;
  waitUntil(predicate: () => boolean | Promise<boolean>, options?: WaitOptions): Promise<WaitResult>;
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

等待默认值为 `timeoutMs=5000`、`intervalMs=100`，均为正数。UI 查询目标支持原生 View/UIView，不接受坐标，具体见 [target 支持范围](target.md#1-作用与支持范围)。

InputResult 是最小公共返回；坐标、注入方式等平台诊断字段可以扩展，详见平台声明。正常操作失败使用 `ok:false`；连接中断等无法取得结果的基础设施异常可以抛出/拒绝，不能误报为输入未发生。

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
{ ok: false, action: 'click', error: { code: 'VIEW_NOT_FOUND', message: '目标未找到' } }
{ ok: false, error: { code: 'TIMEOUT', message: '等待条件未满足' } }
```

错误码示意需映射为实际平台契约。调用方检查每一步结果，不因 `await` 完成就假设成功。

## 7. 实现与线程

双端根入口已注册 drive，类型由各平台 index.d.ts 声明。输入和等待位于 sdk/{android,ios}/drive；元素查询与状态读取由同平台 element 提供，iOS 输入使用 XCTest Runner。

输入 API 自行调度原生 UI 工作，调用方不需要额外包 runOnMainThread。waitUntil 不替 predicate 调度线程；读取原生 UI 属性时使用 common.runOnMainThread。输入后的内部 settle 延时不保证业务完成，仍需显式等待业务条件。

操作直接返回结果，不自动截图或建立证据事件管道。Android 的坐标使用物理像素，iOS 输入使用 point；详见 [target](target.md)。
