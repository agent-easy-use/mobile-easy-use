# CLI target — 目标指定方式

[drive CLI](drive.md) · [运行时 UI target](../runtime-api-design/target.md)

状态：CLI 设计，尚未实现。已确定统一使用 `--target`，双端均支持字符串、path 数组、location 对象三种形式。下文规定 CLI 表示与运行时转换，不表示现有 SDK 已直接支持所有 CLI 字符串。

## 1. 三种形式

| 形式 | Android | iOS |
| --- | --- | --- |
| 字符串 | `R.id.search_button`，表示当前 App 的资源名称 | `search.submit`，表示 accessibilityIdentifier |
| path 数组 | `id::`、`text::`、`tag::`、`class::` 步骤组成的非空字符串数组 | `identifier::`、`label::`、`class::` 步骤组成的非空字符串数组 |
| location 对象 | `{ "x": 540, "y": 900 }`，display 0 的绝对物理像素 | `{ "x": 180, "y": 320 }`，当前界面方向下主屏幕的绝对 points |

平台由目标连接确定，不根据字符串内容猜测平台。坐标是操作位置，不一定对应元素，因此参数命名为 target，而不是 element。

统一参数入口不代表每个命令接受全部形式：

| 用途 | 字符串 | path | location |
| --- | --- | --- | --- |
| drive click / input / long-press / scroll | 支持 | 支持 | 支持 |
| drive wait | 支持 | 支持 | 不支持 |
| 元素截图（后续 CLI） | 支持 | 支持 | 不支持 |

窗口截图可以省略 target，具体命令另行定义。drive 的输入操作与 wait 命令必须提供 target。

## 2. 命令行编码与解析

`--target` 接收一个参数，不另设 `--id`、`--identifier`、`--path`、`--point` 等价选项。以下示例使用 Bash 的单引号保护参数；shell 引号不会成为参数内容。

```bash
--target 'R.id.search_button'
--target 'search.submit'
--target '["identifier::search.panel","label::Search"]'
--target '{"x":180,"y":320}'
```

解析规则：

1. 检查参数去除首尾空白后的首字符；以 `[`、`{` 或 `"` 开头时，按 JSON 解析，结果只允许字符串、数组或对象。
2. 其他输入作为普通字符串，保留原内容，不隐式 trim。
3. JSON 解析失败直接报错，不退回普通字符串解释。解析后再按平台与命令校验。
4. 拒绝空字符串、空 path、非字符串 path 步骤和不符合 location 结构的对象。重复传入 `--target` 报错。

以特殊字符开头的 iOS identifier 可以用 JSON 字符串消除歧义：

```bash
# 实际 identifier 是 [search]
--target '"[search]"'
```

顶层数值不是 CLI target 形式，例如 `--target 2131230890` 按普通字符串处理：Android 因不符合资源名称格式而拒绝；iOS 将其解释为 identifier。CLI 不执行参数中的 JavaScript。

## 3. Android

### 字符串：资源名称

```bash
--target 'R.id.search_button'
```

仅接受 `R.id.<资源名>` 形式，资源名不能为空。运行时适配层使用当前 App 的资源查询能力将名称解析为正整数 ID，再调用 drive；不要求用户查找或硬编码数值 ID。

资源不存在（查询结果为 0）应报告资源解析失败，不继续输入，也不退回文本查询。首版不定义跨 package 的资源名称语法。

当前 SDK 的 `drive.click(R.id.search_button)` 接收的是 JS 表达式求值后的数值；直接传入 `'R.id.search_button'` 字符串尚不支持。CLI 的名称解析是新增适配，不使用通用 eval。

### path：逐层查找

```bash
--target '["id::R.id.search_panel","text::Search"]'
--target '["class::android.widget.LinearLayout","tag::search_button"]'
```

CLI 中 `id::` 使用 `R.id.<资源名>`，由适配层转换成当前 API 接受的 `id::<数值>`。首版不额外提供数值 ID path 写法。

其他步骤沿用运行时语义：text 使用平台文本搜索，可能匹配子串；tag 匹配字符串 tag；class 使用完整运行时类名并包含子类。字符串值按步骤内容传递，不求值。

从具有输入焦点的 Window 根节点开始，每一步在上一步选中的元素自身及其子树中查找，不回溯其他分支。CLI path 不支持函数 getter。

### location：物理像素

```bash
--target '{"x":540,"y":900}'
```

x、y 必须为有限非负数，单位是 display 0 的绝对物理像素，不是 dp。location 只包含 x、y 数值字段，不接受字符串数字。坐标绕过元素定位，不能证明触点属于预期控件。

## 4. iOS

### 字符串：accessibilityIdentifier

```bash
--target 'search.submit'
```

字符串直接作为 accessibilityIdentifier，区分大小写、精确匹配。即使包含 `::` 或长得像 `R.id.xxx`，也不解释成 path 或 Android 资源名称。

### path：逐层查找

```bash
--target '["identifier::search.panel","label::Search"]'
--target '["identifier::search.panel","class::UIButton"]'
```

identifier、label 的值非空、区分大小写且精确匹配；class 使用完整运行时类名并包含子类。不支持 Android 的 text、tag 或 getter 步骤。

窗口选择沿用运行时规则：优先 key window，回退到首个未隐藏且满足 alpha 条件的窗口。每一步选择当前子树中第一个匹配 UIView，包含当前根节点，不回溯，也不默认报告多匹配歧义。输入继续执行前台场景与交互性检查。

定位仅覆盖 UIView，不承诺支持没有对应 UIView 的虚拟 accessibility / SwiftUI 元素。

### location：屏幕 points

```bash
--target '{"x":180,"y":320}'
```

location 只包含 x、y 有限数值字段，不接受字符串数字。坐标必须位于前台场景 key window 的可见范围，单位是当前界面方向下主屏幕的绝对 points，不是截图 pixels。使用截图坐标前需要明确 scale 与坐标变换。

## 5. 执行边界

- CLI target 是可序列化的定位描述，不是原生对象句柄；View/UIView 和函数继续通过脚本使用。
- 每次操作重新定位元素；drive wait 每次检查重新定位，不跨命令缓存原生 View 实例。
- 参数编码与平台不匹配等错误尽量在执行前发现；查找、可见性、可交互性与命中检查由运行时负责。
- 元素未找到时不猜测坐标，元素截图失败时不静默改截窗口。
- 多步 path 是逐层查找，不是对同一元素施加多个并列条件。调用方应提供足够明确的父节点路径，避免误选。

CLI 命令层级和连接参数仍由各命令及公共设计确定；本文只定义 `--target` 的表示方式。
