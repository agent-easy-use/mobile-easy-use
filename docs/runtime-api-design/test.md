# test / expect — MVP API 设计

[返回总览](README.md)

状态：当前 Test.create/expect 契约。精确类型见平台 index.d.ts；测试注册同步，run 和截图断言异步。

## 1. 测试组织

使用 collection 模式，明确测试注册与执行属于哪个集合：

```javascript
const {
  describe,
  test,
  beforeEach,
  afterEach,
  expect,
  list,
  run,
} = Test.create();
```

describe 组织用例，test 注册用例，beforeEach/afterEach 准备和清理，list/run 选择并执行。MVP 延续不支持嵌套 describe、并发/嵌套 run 的边界。前置准备或用例失败后仍尝试执行各项 afterEach，清理错误与原始失败分别报告。

expect 应能在探查函数中独立于 run 使用；不要求所有探查先注册成测试。

## 2. 断言对象

| 对象 | 能力 |
| --- | --- |
| 普通状态值 | 相等、结构相等、大小、包含 |
| 观测事件 | 通过普通数组/谓词检查命中、参数、结果和异常 |
| UI | 使用 inspect.ui 读取存在、可见、焦点等状态，再用通用 matcher 比较 |
| 即时截图 | 采集元素或窗口图片并与指定 baseline 比较 |

MVP 不引入一套专用链路断言 DSL。先使用稳定的快照与事件结构，确有重复模式再增加便利 matcher。

即时 expect 不隐式轮询、不触发业务动作。等待通过 drive.wait/drive.waitUntil 显式表达，不提供 expect.poll。读取失败不能被 .not 反转成通过。

普通值断言使用已取得的数据；截图 matcher 会即时采集，不是比较此前保存的截图。当前没有公共“已采集图片”matcher。

## 3. 从探查转为测试

```javascript
async function inspectEmptySearch() {
  const opened = await openSearch();
  if (!opened.ok) throw new Error(opened.error.message);

  const submitted = await submitSearch('no-result-query');
  if (!submitted.ok) throw new Error(submitted.error.message);

  const ready = await drive.waitUntil(readRequestCompleted);
  if (!ready.ok) throw new Error(ready.error.message);

  return await readSearchState();
}

// 探查：取得证据，分析实际行为。
const snapshot = await inspectEmptySearch();

// 测试：复用采集函数，增加来自需求的预期。
const suite = Test.create();
suite.describe('搜索空态', () => {
  suite.test('请求完成后关闭 loading', async () => {
    const actual = await inspectEmptySearch();
    suite.expect(actual.loading).toBe(false);
    suite.expect(actual.resultCount).toBe(0);
  });
});
```

测试不得把探查到的缺陷直接固化为正确预期。用于证明假设的 override，在验证真实代码修复时应移除；稳定构造空响应等条件的 override 可以保留为 fixture，并明确记录。

测试报告按 beforeEach/test/afterEach 标注错误阶段，保留断言或执行错误；没有 evidenceId 关联协议。复现还需要记录构建身份、场景准备和干预条件；不把资源清理等同于业务场景复位。


## 4. MVP 定义与返回

作用：test 组织可重复执行的测试；expect 对已经获取的事实进行判断；截图 matcher 额外接受截图目标。测试成功来自执行无错误及断言满足，不由回调返回 true/false 决定。

```typescript
interface TestReference { describe: string; test: string }
interface TestFailure {
  phase: 'beforeEach' | 'test' | 'afterEach';
  name: string;
  message: string;
  stack: string;
  matcher?: string;
  actual?: string;
  expected?: string;
}
interface TestResult extends TestReference {
  status: 'passed' | 'failed' | 'notRun';
  durationMs: number;
  errors: TestFailure[];
}
interface TestReport {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  tests: TestResult[];
}
interface TestCollection {
  describe(name: string, register: () => void): void;
  test(name: string, body: () => unknown | Promise<unknown>): void;
  beforeEach(callback: () => unknown | Promise<unknown>): void;
  afterEach(callback: () => unknown | Promise<unknown>): void;
  expect(actual?: unknown, message?: string): Matchers;
  list(): TestReference[];
  run(selection?: { describe?: string; test?: string }): Promise<TestReport>;
}
Test.create(): TestCollection;
```

注册只能在 describe 中进行，同组用例名称唯一；describe 的回调同步执行注册，不能用于异步准备。run 选择 test 时必须同时提供 describe。上述 run 的 Promise 延续现有测试运行器；完整签名以平台声明为准。

| API | 返回/失败 |
| --- | --- |
| Test.create | 独立 collection |
| describe / test / beforeEach / afterEach | void；非法注册抛错 |
| expect | matcher 对象；创建本身不代表断言已通过 |
| list | 注册顺序的名称数组，不执行测试 |
| run | TestReport；用例失败进入报告，参数非法/无匹配等执行入口错误拒绝 |

MVP 延续串行执行、首个失败后其余用例为 notRun。各 afterEach 均尝试执行，即使 beforeEach 只完成了一部分。资源由 fixture 显式管理，不自动重置页面、账号或缓存。

## 5. expect 的最小集合

```typescript
interface Matchers {
  readonly not: Matchers;
  toBe(expected: unknown): void;
  toEqual(expected: JsonValue): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toMatch(expected: RegExp): void;
  toContain(expected: unknown): void;

}
```

上述集合基于现有 matcher。toBe 使用 Object.is，toEqual 比较普通 JSON 结构；toContain 对数组做成员判断，不自动深比较。数值比较不隐式转换类型。UI 状态由 inspect.ui 读取，原生属性通过 common.runOnMainThread 读取，再使用通用断言；expect 不隐式查找 UI 或调度主线程。

断言通过返回 void，失败抛出/拒绝 AssertionError；读取或通信失败保留原始错误，.not 只反转匹配结果。UI 不存在不等于 hidden。

```javascript
const { expect } = Test.create();
const snapshot = await readSearchState();
expect(snapshot.loading).toBe(false);

const events = await methodWatcher.current();
expect(events.ok, events.error ?? 'Method capture succeeds').toBe(true);
expect(events.data.some(event => event.status === 'returned')).toBe(true);
expect(await inspect.ui.isVisible(searchField)).toBe(true); // 明确即时查询 UI，不是读取先前截图。
```

图片断言使用当前已实现的接口：

```typescript
expect(target).toMatchElementScreenshot(baselinePath: string, options?: { maxDiffPixelRatio?: number }): Promise<void>;
expect().toMatchWindowScreenshot(baselinePath: string, options?: { maxDiffPixelRatio?: number }): Promise<void>;
```

```javascript
await expect(searchResults).toMatchElementScreenshot('/project/baselines/empty.jpg');
await expect().toMatchWindowScreenshot('/project/baselines/window.jpg');
```

平台入口向 Test 注入 `inspect.ui` 截图能力，分别调用 `screenshotElement` 和 `screenshotWindow`，再由 Host 比较返回的 `filePath`。不使用带高亮图片；公共 expect 不直接导入平台模块，不实现截图或裁剪。

baseline 是 Host 已存在的 PNG/JPEG。相对路径按 call_function 入口模块目录解析，Inline 使用绝对路径。差异比例范围 [0,1]，默认 0；尺寸不同判定不匹配。采集、解码、读取和传输错误直接传播，不被 `.not` 反转。返回 void，比较不通过时抛出包含实际和基准图片路径的断言错误。不自动创建或更新 baseline。旧 `toHave*ScreenShot` 名称不保留。

## 6. 执行与返回示例

以下使用 Android field；iOS 对应定义为 `{ instance: configObject, property: 'enableSearch' }`，通过 getter／setter 读写。

```javascript
const suite = Test.create();
let removeOverride;

suite.describe('功能配置', () => {
  suite.beforeEach(async () => {
    removeOverride = await override.field(
      { instance: configObject, field: 'enableSearch' },
      true,
    );
  });
  suite.afterEach(async () => {
    if (removeOverride) {
      await removeOverride();
      removeOverride = undefined;
    }
  });
  suite.test('配置已启用', async () => {
    const actual = await readConfig();
    suite.expect(actual.enableSearch).toBe(true);
  });
});

const names = suite.list();
const report = await suite.run({ describe: '功能配置' });
if (!report.ok) {
  // 将 report.tests 中的失败阶段、错误和证据交给 Agent 分析。
}
```

成功报告示例：

```javascript
{
  ok: true, total: 1, passed: 1, failed: 0, notRun: 0,
  tests: [{
    describe: '功能配置', test: '配置已启用',
    status: 'passed', durationMs: 12, errors: []
  }]
}
```

报告通过普通脚本返回值传给 Host/Agent，不额外生成 evidence manifest。
