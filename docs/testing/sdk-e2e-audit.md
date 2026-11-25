# SDK E2E 覆盖与合理性审计

审计日期：2026-11-24。代码基线：`e9782bc`。这是评估与建议，不代表下述缺口已补齐，也不授权自动扩展公开 API。审计期间不修改 SDK、已有测试或原生 fixture。

## 结论

现有测试已经有相当多真正有效的原生结果断言，不是一套只有 `ok:true` 的冒烟。但**尚不满足“开发者公开 API 全覆盖”**：公开入口与内部模块调用混用；iOS 地址断点没有用例；`Test.list()`、`expect(...).toBeFocused()` 没有设备用例；若干 API 的重要分支仅在内部 debugger 测试中覆盖。类型声明和实际行为也有不一致，不能用文件数量或全绿代替契约完整性。

优先顺序应是：明确契约 → 让现有用例走公开入口 → 补少量高价值使用场景 → 整理重复/慢用例。不要先扩充错误参数排列组合，也不要为每个内部函数机械增加测试。

## 1. 审计口径

权威入口为 `sdk/{platform}/index.js` 实际安装的全局 API，参数、返回值及语义对照各自 `index.d.ts`。局部文件的 `export` 不自动等于开发者公开入口。当前有 Android 28 个、iOS 30 个 E2E 文件（不计 helpers/基线），数量不代表覆盖率。

按以下证据强度分类：

- **公开行为覆盖**：从开发者入口调用，并断言原生业务结果、采集内容或清理后的行为。
- **实现覆盖**：直接导入 SDK 源模块或内部 debugger；能够验证实现，但不能单独保护顶层导出和适配。
- **辅助使用**：用作导航/准备、断言工具；能够说明链路可用，但不等于其全部契约得到验证。
- **缺口/契约待定**：没有对应断言、只能推断，或声明与实现不同。
- **已知失败/未执行**：单独标注，不计为通过。

不要求所有 API × 所有 target × 所有类型的笛卡尔积。共享 target 解析用一组代表性完整测试，输入文本/长按/滚动分别保护自己独有的结果。错误、清理和后续恢复优先于大量单纯参数校验。

Java/ObjC/Swift 是 Frida 桥接导出，不重测其全部第三方 API；需要 SDK 接入冒烟以及 SDK 自己包装/传递值的边界。Test/expect 本身继续保留 `test/framework` 的细致单元测试；新“公开入口需要 E2E”要求可由少量真实运行时用例补足，不需要把整个框架单元测试搬进 App。

## 2. 首先处理的契约问题

| 编号 | 已确认事实 | 影响与建议 |
| --- | --- | --- |
| C1 | iOS `IOSLogRecord.level` 声明为 `string`，`inspect/log.js` E2E 明确断言其为 `null` | 类型正确不等于使用正确。将真实平台差异写入声明，并保留真实日志断言；不能要求测试迁就错误声明 |
| C2 | 两端 `.d.ts` 还包含旧 `Override.run`、`target/withReturn/withValue` 等类型；iOS `IOSInputApi` 示例仍调用 `IOS.input`，旧 `IOSWaitApi` 示例仍调用 `IOS.wait` | 不计入“待补 E2E 的新 API”。删除或重写旧示例/冗余类型，避免 Agent 生成不可调用的代码 |
| C3 | Android `AndroidUiPathStep` 包含函数 getter，`element/query.js` 也确实支持；此前迁移文档却称旧 getter targets 不再保留 | **此前迁移判断不准确**。当前它是公开能力，应补 getter 接收上一步 View、返回原生 View/null 的代表测试，或经明确 API 决策移除；不能默认为已废弃 |
| C4 | iOS 公开 `drive.longPress`/`scroll` 只有固定时长/距离，实现固定 600ms/300pt；底部旧 `IOSInputApi` 描述可选 duration/distance | 公开 `IOSDriveApi` 签名是当前有效签名。无需给已不接受的参数补 E2E；清除会误导的内部旧签名/示例 |
| C5 | iOS source/address 两种 `IOSCodeDefinition` 都公开；测试只用 source | 地址入口是确定缺口，不是可忽略的内部实现细节 |
| C6 | `inspect.method` 实现注释要求调用方管理 capture 中原生引用生命周期，公开类型只写 `Record<string, any>` | 不能把 Java/ObjC wrapper 等同于可永久持有的 JSON。先明确跨 callback/current/stop 的有效期，随后测试调用方正确保留/释放的使用方式 |
| C7 | `override.field` iOS 通过 getter/setter 直接执行，未自动切主线程；全局 SDK 注释又宣称默认任意线程可调用 | 对普通模型属性不一定有问题，对 UIKit setter 不能推断安全。明确原生属性线程要求和使用方式，增加一个真实 UI 属性经 main-thread 调度的场景；不直接假设所有属性都应自动放主线程 |
| C8 | iOS `override.code` 类型未限定 earlyReturn 的具体 ABI 支持范围，而现有历史记录含 Swift/部分返回值问题；运行时设计文档也有过时验证环境文字 | 需要依据实际设备回归更新明确支持边界，公开方法安装成功不证明原生调用方得到正确返回值 |

## 3. drive：开发者要让 App 到达目标状态

下表中的路径以各平台 `ApiDemo/tests/` 为根。

| 公开 API | 已有证据（双端，除非注明） | 缺口/处理建议 |
| --- | --- | --- |
| `drive.click` | `drive/click` 验证 ID/identifier、path、wrapper、坐标、次数、拒绝后恢复；Android `input-boundaries` 验证无注入事件，iOS 验证自定义 UIView、裁剪/遮挡、重复标识 | 主干较强。已有多种无效坐标测试可保留短表，不再扩成更大矩阵；公开入口要替代测试中对 drive 源模块的直接导入 |
| `drive.input` | `drive/input` 检查原生文本和焦点；iOS `input-boundaries` 检查 Unicode、追加与 A→B→A 焦点切换 | Android 缺追加输入及切换字段后不污染旧字段；两端缺典型空文本拒绝后恢复。Android 任意 Unicode 不是承诺，不照搬 iOS Unicode 成功预期 |
| `drive.longPress` | 双端原生计数；Android 检查 DOWN/UP 持续时间且无短点击；iOS covered-window 拒绝 | 不需要公开不存在的自定义时长来测试。可补 iOS 长按后未触发短点击，避免只靠 action 成功 |
| `drive.scroll` | `drive/input` 验证 up/left 导致原生 offset 增大 | down/right 返回已有位置的行为未覆盖；只用主 target 类型即可。补非零偏移下反向滚动及边界不越界，比四种 target 全排列更有价值 |
| `drive.wait` | `wait`、`wait-transitions`、`inspect/ui` 包含五种状态、延迟、超时、native wrapper、attach/detach/resize | 已有大量有效覆盖，部分断言分散到 inspect。应按行为归到 drive；补“缺失不等于 hidden”的等待语义及路径每轮重新解析的场景，而非只在同一对象上改属性 |
| `drive.waitUntil` | 同步/异步谓词、3 次轮询、TIMEOUT，许多业务完成等待 | 缺谓词抛错后重试成功、超时 `lastCheckError`、非布尔返回；各选一例，避免穷举 NaN/Infinity 等配置 |

iOS `runner-validation`、`timeout.lifecycle`、`background.lifecycle` 使用内部命令制造 Runner 过期/方向/失联状态。它们不满足“公开入口独立覆盖”，但保护了“不能重复输入、后台不能误点”等重要真实结果。建议保留为少量基础设施 E2E，并清楚标注；没有理由为了消除内部导入而公开 `prepareInputCommand` 或 `requestController`。

## 4. inspect：开发者要获得可以解释和断言的证据

### 4.1 日志、方法与代码位置

| API / 返回接口 | 已有证据 | 缺口与建议 |
| --- | --- | --- |
| `inspect.log.watch(tags)` | 双端多 tag、重叠订阅、独立 stop、线程、并发日志、容量后其他订阅可用 | iOS 的 `[TAG]` 格式与动态 TAG 分支没有同等覆盖；无效 tags 后新订阅恢复、无关日志不影响容量可选代表例 |
| log watcher `current()` | 累积快照、先前返回数组不随新日志增长 | 缺调用方修改 record 字段后不污染内部记录的明确断言；这是有效“证据快照”语义，不是为了测试 spread 实现 |
| log watcher `stop()` | 冻结、重复 stop、stop 后 current 失败、peer 继续工作、脚本卸载 | 已有较强保障。多线程高流量场景应保留，不能因为难读就删除 |
| `inspect.method.watch(definition, options)` | 默认记录、不改变返回值、filter、enter/leave、静态方法；Android 重载和 Java 异常；iOS ABI、递归、工作线程 | Android 重复 watch 的拒绝/恢复缺口；两端 callback 返回原生 wrapper 的正确使用缺口；iOS ABI 用例 capture 了 enter 参数但只核对 leave，需核对输入 |
| method watcher `current()` | 单次/多次调用后读取结果 | 缺真实业务仍执行时 `status:running`、完成后更新 returned；现有“enter 内 stop”不能替代普通 Agent 并发观测场景 |
| method watcher `stop()` | 冻结、重复调用、后续原生调用正常、卸载；iOS 逆序叠加 watcher | “在 capture 中 stop”优先级低于正常外部 stop。不要以此复杂路径作为主用例；可以缩减或另列专项 |
| `inspect.code.watch` Android | `code`、`code-read-types`：condition、参数/局部/对象/数组、部分失败、重载、并发、stack、上限、get 有效期 | 源码导入的 code 测试应改用公开全局；补默认记录中的 timestamp/thread/hitId 与 stack 帧字段断言；保留新读取矩阵，不重加旧 snapshot 契约 |
| `inspect.code.watch` iOS | 公开 source 位置、OC/Swift 条件与表达式；内部 debugger 测试还覆盖部分错误、同位置条件、坏 source 后恢复 | **地址断点完全缺失**；把内部有效场景经公开 API 迁入 inspect。增加不同位置 watcher 同时存在、各自停止不影响其他 watcher |
| code watcher `current()` | 双端累积、stop 后不可读；iOS capture 修改副本不影响内部结果 | Android 容器隔离已部分验证，不能要求原生对象本身被深拷贝；iOS stack 只检查上限，空数组也会通过，应有非空与有效帧字段断言 |
| code watcher `stop()` | 冻结、重复、脚本卸载（Android watcher+override，iOS 主要 override session） | iOS active inspect.code 卸载后恢复建议补公开 watcher 生命周期，避免只依赖内部 stop/session 结果 |

默认记录的“metadata”测试名称大于断言范围：例如 iOS `inspect/code.js` 的 default record 用例仅检查长度及无 capture/stack，没有核对 hitId/timestamp/threadId/threadName。应把开发者用于关联事件的字段列成小型、可读的契约断言；不要绑定确切时间、绝对线程 ID 或每个 stack symbol。

`common.currentThreadName` 并非完全缺失：双端 `inspect/method-boundaries` 在真实命名工作线程里断言了名称。common/runtime 中允许 null 的断言较弱，但不能据此忽略其他文件已有的强证据。

### 4.2 UI 的每个公开入口

双端 `inspect/ui.js` 使用真实原生 View 子树，且固定视觉基线另有用例。下列所有入口已有实现测试，但大部分直接 import `sdk/.../inspect`，尚应统一通过 `globalThis.inspect.ui` 验证导出。

| 公开 API | 已有行为 | 评估 |
| --- | --- | --- |
| `isExisting` | 找到、缺失、detached wrapper 仍存在 | 保留；与可见性不同 |
| `isVisible` | visible/hidden、透明祖先、detached；iOS 祖先裁剪 | 保留；不承诺遮挡检测，不添加与契约冲突的“被盖住必须 false” |
| `isHidden` | 存在但隐藏/零尺寸；缺失 false | 保留；补 wait 层对应语义即可 |
| `isFocused` | 原生输入框 becomeFirstResponder/requestFocus 后 true、缺失 false | 可增加失焦 false，特别是两个输入框切换；不要只检查“某处有焦点” |
| `isEnabled` | 自身 enabled、缺失；iOS UIControl 与 userInteractionEnabled | 有效平台差异；保持各自语义 |
| `tree` | 深度 0/1、child、原生 identity、节点继续用作 target、错误 depth | 有用。缺默认 depth=3 与更深后代的明确测试；只挑一棵小树即可 |
| `layout` | px、density/scale、本地 bounds、iOS 非零 origin | 强，保留；值来自固定原生布局而非复制 SDK 计算 |
| `layoutInParent` | 相对位置、变换、滚动/非零 origin | 强，保留 |
| `layoutInWindow` | 层级偏移、窗口坐标 | 强，保留 |
| `layoutInScreen` | 主窗口及偏移 popup/window 的关系 | 保留；不把主窗口==屏幕的一例当成全部证明 |
| `screenshotWindow` | 返回图片，固定首页基线，其他页面不匹配 | 已有真正视觉断言，不是仅路径非空 |
| `screenshotElement` | 裁剪大小、隐藏/缺失拒绝、固定 FIRST 基线 | 已有固定基线保护；“拿刚截的图当 baseline”仅是传输/比较链路验证，应明确名字并减少重复 |
| `screenshotElementInWindow` | highlight true/default/false、owning window、裁剪、原生布局未变化、图像不同 | 图像整体有差异不证明边框只出现在正确像素。几何元数据已有保护，精准边框像素可以后续补一个低成本场景，不需新增 API |

`inspect/ui-screenshot.js` 与 `inspect/ui.js` 部分重复，但前者现有首页与 highlight=false 比较有独立价值。建议合并重复截图步骤，保留“真实页面、目标所属窗口、不改变布局、固定基线”四种目的；不简单按文件数量删除。

## 5. override：开发者要临时改变业务结果并能恢复

| 公开 API | Android | iOS | 建议 |
| --- | --- | --- | --- |
| `override.method` | 固定/回调、filter、静态首次调用、重载、重复拒绝、remove | 对象/BOOL、回调指针、类方法、叠加逆序恢复 | 两端仍缺常见数值/对象 null/void 的替换与原生调用方结果；iOS 的 double/Int64/结构参数转换尤其不能用 inspect.method ABI 测试代替。选代表类型，不重新穷举全部原生类型 |
| `method` callback/filter 错误 | 当前实现 catch 后调用原方法，测试未明确保护 | 同左 | 这是**现实现有行为**，此前迁移文档对旧 fallback 契约的退役说明不能替代当前代码事实。先补准确公开说明，再验证一次异常后业务继续及 remove 可用 |
| `override.field` | 实例/静态、对象身份、数组/null、双实例隔离、重复、App 后续写入后恢复 | scalar/strong/weak、继承、custom accessor、readonly、失败后恢复 | 主干较好。Android 补字段名与方法冲突的 Frida `_name` 选取及错误 static/instance；iOS 补两实例隔离和 nil/copy 属性（若承诺支持），优先于更多无效参数 |
| field setter 副作用 | Java 直接字段写入 | 目前 getter 回读和恢复标记，不直接证明自定义 setter 副作用被执行 | iOS 如需“通过 setter”的保证，应加原生 setter 计数/归一化结果；仅最终属性值不够区分 setter 与 ivar 直接写入 |
| `override.code` | public implementation 测试覆盖写入、condition、type matrix、earlyReturn、错误写入不阻断业务、remove | public 只覆盖 OC/Swift 写入、条件和 OC int return；其他 ABI 大多在内部 installDebugger | 优先把 iOS internal early-return/错误恢复迁到公开 override.code；地址定义缺失；明确已知失败的支持范围 |
| 各 `remove()` | 方法/字段/代码都有恢复与重复清理 | 同左 | 可保留少量重复 remove 测试，但不为每种数值重复；还缺 method/field 未 remove 就卸载的明确契约，尤其 field 写入不会因为 JS 消失自然恢复，**不能未经承诺就写“自动恢复”测试** |

这里的 `method-static.js` 很合理：专用 fixture、安装前不预热、Java 调用点、原方法计数、filter 回退、恢复。它保护静态覆盖的常见风险，不声称替代全部历史设备 ART 矩阵。

## 6. element、common、R、桥接与 Test/expect

| API | 已有证据 | 需要处理 |
| --- | --- | --- |
| Android `element.findUiView` | ID、tag、class、自身匹配、父类、作用域、不回溯、hidden、焦点窗口 | 缺 text:: 子串/首匹配及函数 getter。明确每轮 path 从根重解析；不必新建 root API |
| iOS `element.findUiView` | identifier、label、class、父类、范围、不回溯、hidden | 覆盖较好；少量错误 target 后恢复即可，不照搬 Android getter |
| `common.runOnMainThread` | 双端核对原生 main、返回值、Promise adoption、异常与后续恢复 | 缺“已在 main 内再次调用”路径；一例嵌套即可。async callback await 后不保证仍在 main，应通过契约说明而非承诺全程线程 |
| `common.currentThreadName` | common 弱断言 + method/log 工作线程强断言 | 保留后者，不误报为完全未覆盖；可把 common 用例断言改为与原生名称相符 |
| iOS `common.findClass` | 精确、Swift OC-runtime 后缀、selector 消歧、缺失 | 充分的主要场景；可补显式 module-qualified 名称，不必重测 ObjC 所有 class 查询 |
| Android `R` | id/string 对比编译值、missing=0、之后仍可查 | 对通用 resource-type 分发足够做 P0；可加 drawable/layout 代表值，但没必要为每个资源种类建原生 UI。声明是资源 ID，不是字符串值 |
| `runtimeStatus()` | 双端 platform/available/appId | releaseVersion 未核对；正则、包含判断与完整 appId 比较重复。保留准确身份和版本基本格式即可 |
| `Java` / `ObjC` 导出 | 众多用例真实 bridge 调用；源码 import 经 Host alias 指向 global bridge | 足够接入证明，不按 Frida 全量 API 建测试 |
| `Swift` 导出 | 没有直接 Swift bridge 用例；LLDB Swift 表达式和 ObjC 可见 Swift class 都不是 Swift bridge 证明 | 增加最小 bridge export/availability 冒烟；如开发者承诺纯 Swift 调用，应增加真正通过 Swift bridge 的代表性行为，不能用 LLDB 替代 |
| `Test.create`、`describe`、`test`、`beforeEach`、`afterEach`、`expect`、`run` | 所有用例依赖真实框架，Host 使用 run 和筛选；framework 有详细错误/报告测试 | 保留框架单元测试。加一个独立真实运行时 smoke，验证生命周期顺序及报告，不在每个 API 用例里嵌套框架测试 |
| **`Test.create().list()`** | framework 单元测试；没有 E2E 调用 | 公开方法的确定缺口，可放 `tests/common/test.js`，与 SDK common/test 目录职责对应 |

每个公开 matcher 的情况：

| matcher | 双端 E2E |
| --- | --- |
| `toBe`、`toEqual` | 大量原生结果比较；框架失败/类型边界由 framework 测试补充 |
| `toBeGreaterThan`、`toBeGreaterThanOrEqual`、`toBeLessThan`、`toBeLessThanOrEqual` | 几何、计数、时长、stack 范围中均有调用 |
| `toMatch`、`toContain` | 错误信息、运行时身份等有调用；框架中覆盖不匹配 |
| `toExist`、`toBeVisible`、`toBeHidden`、`toBeEnabled` | 元素、等待、class 用例真实 UI |
| **`toBeFocused`** | **双端没有调用**。`inspect.ui.isFocused` / `drive.wait(...,'focused')` 不等于此 matcher 已被调用 |
| `toSatisfy` | 实际 View 身份/文字等；可以加一次 async predicate 的真实主线程使用 |
| `toMatchElementScreenshot`、`toMatchWindowScreenshot` | 固定图片基线和正/负比较；传输/失败行为 framework 有覆盖 |
| `.not` | 缺失元素与截图负断言。无需所有 matcher × not 全部再跑设备 |

## 7. 合理性与过度设计评估

### 应保留

- 原生业务计数、文本、滚动偏移、setter 行为、调用方返回值：与开发者目的直接关联。
- 失败之后还能继续使用、独立订阅/覆盖互不影响、脚本卸载后原生业务正常：长时间 Agent 探索必需。
- Android 类型读取矩阵：长整型精度、负零、数组、对象访问容易产生静默错误。短表驱动比复制测试更清楚。
- iOS weak property 测试中的 autorelease pool：它排除临时原生持有者干扰，属于必要的内存语义验证，不是无意义内部调用计数。
- UI 原生构建子树：真实 UIView/View，不是 mock；确定几何可以避免依赖复杂业务页面。无需强制所有 fixture 都写成独立原生界面。

### 应简化/调整

1. **公开 API 测试直接 import 实现**：Android 8/28、iOS 13/30 个测试文件含 SDK 源码导入（统计包含有意的内部测试）。逐个区分准备 helper 与被测入口；被测公开入口改为全局，真正内部协议测试保留例外。不能把全部 import 一刀切删除。
2. **内部 LLDB 场景与 public 用例重叠**：保留行为，迁到 inspect/override；不保留同一表达式/写入在两层各跑一次。少量注册/清理原语仍可内部验证，若全被公开契约覆盖可删除。
3. **iOS code 10,001 次断点压力混入 all**：容量保护有意义，但当前已知超时并污染清理。应明确为慢/专项测试，有独立入口与预算，不默默 skip，也不为测试暴露可调容量生产 API。日常测试优先保护少量记录和持续业务正确性。
4. **stop-from-enter**：实现边界可以保留专项，但普通使用者“外部 current/stop 与进行中方法”的场景更值得优先。不要为了迁移历史边界而把正常用法遗漏。
5. **日志 10/50 次 churn**：有多线程安全价值；次数应是最小能体现并发与多订阅独立性的规模。没有重现频率证据，不必继续增大压力数字。
6. **测试名与断言不一致**：metadata 用例未断言 metadata；ABI 用例采集 enter 未断言；属性值正确不独立证明 setter 副作用。修改断言或缩小名称，不能只补漂亮名字。
7. **固定基线与自比较混用**：固定基线保护视觉结果，自比较仅保护链路；两者都可存在但不要把后者宣称视觉正确性。
8. **清理循环遇首个错误停止**：如 field `removals.reverse()` 单个 remove 抛错会跳过其余清理。可用简单逐个 try/catch 后汇总首错，避免新建通用 registry。正常成功路径不要求把所有代码都防御化。
9. **未声明准备条件**：现有首页截图脚本依赖首页但缺 beforeEach(returnHome)。单独启动时成立，长期组合运行易受前一个测试状态影响；应明确场景准备，不依赖字母顺序。
10. **编码格式混入业务预期**：Android override/code 的 nested array 断言使用多层 `JSON.stringify` 拼出 expected。优先在 fixture 结果读取边界解码，并在正文断言二维内容；不要让开发者先理解多层序列化格式才能知道业务预期。
11. **原生编译产物一致性**：目前壳只安装 prebuilt，这是正确设计；报告的源码 revision 并不证明 APK/.app 来自该 revision。断点源码 marker 与产物不匹配会误导结论。可记录产物 hash/build identity，至少让过期产物可追溯，不把编译重新塞回 E2E。

## 8. 内部 API 是否应公开

没有发现“因为某内部函数有测试，所以必须公开它”的理由。下面按实际开发者目的评估：

| 能力 | 建议 | 原因 |
| --- | --- | --- |
| `registerBreakpoint` / `installDebugger` | 保持内部 | inspect.code/override.code 已承接读写目的；公开资源和 callback 生命周期会制造第二套契约 |
| `requestDebugger` / `requestController` / `prepareInputCommand` | 保持内部 | transport、Runner deadline、orientation 是 SDK 责任；内部故障测试不等于用户需求 |
| `prepareStaticHook` | 保持内部 | 调用方不应手工完成静态类初始化规避；公开方法自己保证 |
| `getRootViews` / focused window helpers | 暂不公开 | 查询目标、按原生 wrapper 截所属窗口已有路径。跨窗口发现确有 Agent 价值，但应先定义“当前窗口/多窗口枚举”用户需求，而不是直接输出 Android 私有 root 数组 |
| tree 无已知 target 的入口 | 候选文档改进，非马上加 API | Agent 首次探索通常不知道 ID。现有 class path 可以作为根入口候选（Android View / iOS UIWindow），需要一个经验证示例；如果无法满足再考虑省略 target 的 tree，不预先扩大 API |
| native object state/snapshot | 不新增通用 inspect.state | 当前设计明确直接使用 Frida 读取并投影业务字段，已有 wrapper 和 capture；旧 snapshot 会丢掉对象语义，不应为了 Host JSON 就复活 |
| field/name/class 查找 | 保留现有 common.findClass（iOS）/Java.use | 没有证据需要额外统一 factory；多 ClassLoader 是未来明确需求，不从当前单 loader 测试推断支持 |
| 可调 longPress 时长/scroll 距离 | 当前是产品能力缺口候选，不是遗失导出 | 公共实现有意固定参数；需要长按菜单/小距离滚动场景时再讨论扩展。不要因为内部命令支持就自动公开 |
| `snapshot`、`interop`、`rectValue` 等辅助 | 保持内部或另做死代码评估 | 属于转换/几何/历史兼容，不因测试需要暴露 |
| iOS Swift bridge | 已公开，需要验证与说明 | 区分 Swift bridge、ObjC-visible Swift class、LLDB Swift 表达式三条能力，不能互相替代证据 |

## 9. 从 Agent 实际工作流反查

现有测试多数是能力级 E2E：真实 SDK → 真实原生操作 → 原生结果。这是合理的，不必全部改成跨页面长流程。但建议另外保留 **1 条短组合用例**，覆盖真正的探索到断言闭环：

1. 用公开 element/tree 找到可操作目标，不依赖私有 root 工具。
2. 对业务服务方法安装 override；对不同的事件处理方法或日志安装 watcher。
3. drive.click 触发真实 UI 业务，wait 等待完成。
4. 同时断言 UI/业务状态与 watcher 证据。
5. stop/remove 后再次点击，确认恢复原业务、停止收集。

这条用例保护“能力可以组合使用”，不代替各 API 的细粒度测试，也不引入统一 action/scope/registry。Android 同一方法的 inspect.method 与 override.method 当前会因已有 implementation 而冲突，组合用例应使用不同方法，并另将冲突作为明确限制；iOS 叠加要求逆序清理，不能假设双端同规则。

从零探索还缺一个小场景：不知道 ID 时以 class path 找当前根、取浅树，再用返回节点作为 target。源码支持从 focused root/window 开始且包含自身匹配，初步不需要公开 getRootViews；真实演示通过后即可形成脚本示例。如果需求是跨多个窗口发现目标，才另行讨论产品 API。

## 10. 建议实施批次与验收

| 批次 | 内容 | 验收标准 |
| --- | --- | --- |
| P0-A 契约对齐 | level nullable；移除旧 API 示例；Android getter 当前事实；wrapper 有效期；iOS earlyReturn 边界 | 每个公开签名对应实际实现；不新增 API；不把 known failure 写成支持 |
| P0-B 公开入口 | 将公开功能 E2E 的被测入口改用已安装全局；加 `Test.list`、focused matcher、bridge 接入 smoke | 顶层导出被破坏时 E2E 确实失败；所有自有公开函数至少一次真实调用与有效结果断言 |
| P0-C 真正使用缺口 | iOS 地址 watch/override；Android getter/text query；正常运行中 method.current；关键元数据与 ABI enter；错误后恢复 | 每个测试描述一个使用者目标，业务结果可区分成功、未执行、错误目标 |
| P1 组合闭环 | 一个公开 API 驱动的 override + watch + click + assert + cleanup 场景 | 业务和证据都准确，恢复后再次操作正常；不新增 action/scope |
| P1 公共边界迁移 | iOS 内部 debugger 有效用例迁到 inspect/override；方法值类型与 field 有效类型代表例；输入追加/反向滚动/等待重试 | 减少重复同时不丢已保护的行为；public 通过不掩盖内部 ABI 已知失败 |
| P1 常规/慢测试边界 | 单独管理 LLDB 容量/Runner timeout 等慢场景，保留清晰运行命令和报告 | 默认回归有可预测预算；慢测试失败仍显式报告，不能靠 skip 换全绿 |
| P2 文档与产物 | 根 UI 探索示例、产物 hash/build identity、测试名/清理/重复断言整理 | Agent 能从空白状态找到目标、执行、检查证据并恢复；报告能追溯实际运行产物 |

除 API 接入完整性外，不建议输出一个百分比。一个没有地址断点、wrapper 生命周期或错误恢复的“100% 函数调用覆盖率”，对 Agent 仍然可能不可用。

## 11. 验证边界

- Android 的全套通过仅针对配置中的 Android 12 模拟器；不能外推 Android 16 的输入注入权限行为。权限拒绝如何反馈是另一条公开错误契约，不应靠更换模拟器掩盖。
- iOS 使用 iPhone 17 / iOS 26.0.1，不能外推真机全部设备/系统、原生异常展开或可变参数。后两者当前明确不属于 inspect.method MVP。
- 本轮 iOS 分能力独立启动 App 验证，以隔离已有压力/ABI 失败。它验证各组用例可独立运行，不等价于 `--suite all` 的单会话全量通过；Android 则实际执行 `--suite all`。
- E2E 结果基于配置的预构建产物。已有能力实测通过不证明未包含在产物中的新原生源码已验证。

## 12. 本轮实测

本轮只执行已有用例以核实结论，不修改被测 SDK 或用例。已知 iOS code 容量测试不重复触发同一超时，保留既有失败记录。

| 执行范围 | 通过 | 失败 | 未运行 | 证据 |
| --- | ---: | ---: | ---: | --- |
| Android all | 141 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-36-29.965Z-android-498/report.json) |
| iOS override | 17 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-36-29.788Z-ios-454/report.json) |
| iOS drive | 50 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-38-13.781Z-ios-2921/report.json) |
| iOS element | 10 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-40-28.442Z-ios-4732/report.json) |
| iOS common/runtime | 3 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-40-50.931Z-ios-5043/report.json) |
| iOS inspect/method | 3 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-41-12.823Z-ios-5308/report.json) |
| iOS inspect/method-boundaries | 11 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-41-31.160Z-ios-5643/report.json) |
| iOS inspect/log | 4 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-41-51.488Z-ios-5982/report.json) |
| iOS inspect/ui | 12 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-42-12.924Z-ios-6292/report.json) |
| iOS inspect/ui-screenshot | 1 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-42-32.781Z-ios-6727/report.json) |
| iOS inspect/visibility | 1 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-42-51.707Z-ios-7156/report.json) |
| iOS inspect/visual-element | 1 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-43-13.399Z-ios-7478/report.json) |
| iOS inspect/visual-window | 1 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-43-32.330Z-ios-7899/report.json) |
| iOS inspect/code | 4 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-43-51.482Z-ios-8238/report.json) |
| iOS inspect/unload.lifecycle | 1 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-44-16.091Z-ios-8587/report.json) |
| iOS common/debugger/index | 13 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-44-52.424Z-ios-9381/report.json) |
| iOS common/debugger/unload.lifecycle | 1 | 0 | 0 | [report](../../artifacts/e2e/2026-11-24T12-45-19.493Z-ios-9901/report.json) |
| iOS common/debugger/early-return | 8 | 1 | 1 | [report](../../artifacts/e2e/2026-11-24T12-45-59.940Z-ios-10819/report.json) |

Android 全量 **141 项通过**。iOS 上表分组累计 **141 项通过、1 项失败、1 项未运行**；不包含容量专项，不能宣称 iOS 全量通过。

iOS earlyReturn 的失败是原生业务结果错误：Swift `Int(200)` 实际返回 `-5123934813108280000`。同组 OC int/double/BOOL/long long/object/nil 及两项断点切换回归通过；void 最初被 fail-fast 中止，随后在新 App 会话中单独执行通过。本轮确认错误仍可复现，不把错误整数本身或其每次具体值推断为根因，也未重新做 ABI 根因调查。

容量专项 `inspect/code-limits` 本轮未重跑。既有 [失败报告](../../artifacts/e2e/2026-11-24T03-08-41.569Z-ios-74083/report.json) 记录 240 秒执行超时、15 秒清理超时；[迁移记录](sdk-test-migration.md) 说明已尝试分批执行仍失败。它仍是待解决项。

补跑被中止的 void：**1 项通过**，[report](../../artifacts/e2e/2026-11-24T12-46-39.574Z-ios-11717/report.json)。按独立用例合并，本轮 iOS 为 **142 项通过、1 项失败**，另有 1 项容量专项未执行；原始失败报告中的 `notRun:1` 保留，不覆盖历史结果。

## 13. 第一批实施（2026-11-24）

以下更新实施状态，不改写前面的审计基线：

- 清理双端旧 `Override.run` 类型及 iOS 旧 `IOS`/UI/screenshot 声明；保留当前 drive 使用的输入/等待类型，修正固定手势参数及示例。
- 修正 iOS log level 的 nullable 类型；将 method capture 的原生引用生命周期、iOS field 安装/恢复的线程责任和 Swift earlyReturn 已知错误写入各平台 `.d.ts`。不改变运行时行为或扩展 API。
- 公开能力用例改用已安装的 drive/inspect/override/common。同步原生查询只用于目标准备/读回，内部 debugger、Runner 故障注入及截图结果读取继续保留必要内部调用；不公开这些工具。
- 双端新增 `tests/common/test.js`，直接验证公开 Test.list 与 hooks；现有真实输入场景增加 `toBeFocused`。iOS common/runtime 增加 Swift bridge 初始化冒烟，它不代表完整纯 Swift 调用能力已验证。
- 类型检查增加旧入口拒绝、iOS nullable level、固定手势参数及 Swift 导出保护。测试约定明确被测入口必须使用公开全局。
- 修正旧 probe 迁移文档对 Android getter 和 method 错误回退的误述；相应行为补测属于第二批。

Swift earlyReturn 的原始失败用例、容量压力用例及预期均未调整。本批没有修复这两个已知问题，也没有宣称公开 API 已全覆盖。

第一批验证：Android 全量 **142 项通过**；iOS 受影响分组 **86 项通过**；类型声明检查 **4 项通过**。iOS 为分组独立会话验证，不是全量 all。原生 App 未重建，使用配置中的预构建产物；SDK JS 使用当前工作区构建。

| 范围 | 通过 | 证据 |
| --- | ---: | --- |
| android all | 142 | [report](../../artifacts/e2e/2026-11-24T12-51-48.293Z-android-16362/report.json) |
| ios common/runtime | 4 | [report](../../artifacts/e2e/2026-11-24T12-51-49.935Z-ios-16499/report.json) |
| ios common/test | 1 | [report](../../artifacts/e2e/2026-11-24T12-52-21.112Z-ios-18106/report.json) |
| ios drive | 50 | [report](../../artifacts/e2e/2026-11-24T12-52-40.489Z-ios-18686/report.json) |
| ios element | 10 | [report](../../artifacts/e2e/2026-11-24T12-54-55.961Z-ios-20724/report.json) |
| ios inspect/ui | 12 | [report](../../artifacts/e2e/2026-11-24T12-55-18.742Z-ios-21145/report.json) |
| ios inspect/ui-screenshot | 1 | [report](../../artifacts/e2e/2026-11-24T12-55-38.629Z-ios-21476/report.json) |
| ios inspect/code | 4 | [report](../../artifacts/e2e/2026-11-24T12-55-57.414Z-ios-21791/report.json) |
| ios override/code | 4 | [report](../../artifacts/e2e/2026-11-24T12-56-25.335Z-ios-22226/report.json) |

## 14. UI 断言收敛（2026-11-25）

根据后续 API 决策，移除五个 UI 状态 matcher 和 toSatisfy；上述历史审计中关于补齐这些 matcher 的建议不再适用。现有用例保留行为验证，改为 inspect.ui/显式原生属性读取加通用断言。截图 matcher 保留，Test/expect 不再注入元素查询、主线程调度和状态检查依赖。

移除后的验证：framework 20 项、声明检查 4 项、Android 全量 142 项、iOS 受影响分组 25 项通过。iOS 不是全量 all；继续使用预构建 App。

| 范围 | 通过 | 报告 |
| --- | ---: | --- |
| android all | 142 | [report](../../artifacts/e2e/2026-11-25T06-03-03.298Z-android-1638/report.json) |
| ios drive/input | 4 | [report](../../artifacts/e2e/2026-11-25T06-03-04.847Z-ios-1748/report.json) |
| ios drive/wait-transitions | 8 | [report](../../artifacts/e2e/2026-11-25T06-03-42.474Z-ios-3441/report.json) |
| ios element | 10 | [report](../../artifacts/e2e/2026-11-25T06-04-10.549Z-ios-4424/report.json) |
| ios inspect/visibility | 1 | [report](../../artifacts/e2e/2026-11-25T06-04-34.665Z-ios-4954/report.json) |
| ios inspect/visual-element | 1 | [report](../../artifacts/e2e/2026-11-25T06-04-53.568Z-ios-5368/report.json) |
| ios inspect/visual-window | 1 | [report](../../artifacts/e2e/2026-11-25T06-05-12.376Z-ios-5741/report.json) |
