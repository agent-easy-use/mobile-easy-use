# iOS override — API 说明

[返回 override 总览](override.md)

本文描述 iOS override 当前实现。已接入根导出与类型声明；返回函数、错误与清理规则见[总览](override.md#3-返回与移除)。method／field 使用 Frida，code 使用 LLDB。

## 1. method：替代 Objective-C 方法执行

```typescript
interface MethodDefinition {
  className: string;
  selector: `- ${string}` | `+ ${string}`;
  filter?: (...args: NativeCallbackArgumentValue[]) => boolean;
}
override.method(
  definition: MethodDefinition,
  returnInstead: NativeCallbackReturnValue | ObjC.Object |
    ((...args: NativeCallbackArgumentValue[]) => NativeCallbackReturnValue | ObjC.Object),
): Promise<Remove>;
```

- className 指定类名；`+ selector` 定位类方法，`- selector` 定位实例方法。不做实例筛选，所有派发到所选方法实现的调用都会进入替换回调。
- 允许重复替换同一个方法；remove 直接恢复该次安装前保存的 IMP。调用方保证按安装逆序移除，SDK 不管理覆盖栈、不检查当前 IMP 或移除顺序。code 与 method 独立。
- filter 位于 definition，仅按原方法参数筛选。filter 与 returnInstead 回调按顺序接收业务参数，排除 self／_cmd，不接收 invocation 对象。
- 参数保持 Frida NativeCallback ABI 类型：对象／selector 为 NativePointer，不自动转换成 ObjC.Object；数值、Int64／UInt64、结构体数组遵循 ABI。
- returnInstead 为固定值或同步函数。返回值原样交给 Frida NativeCallback，按原方法 ABI 处理，SDK 不做 boolean 转数字等额外转换。对象返回遵循 NativeCallback 的指针要求，不自动桥接普通 JS 字符串或 JSON，也不将 JS null 转为空指针。BOOL 示例使用 0／1。
- 仅支持暴露到 Objective-C runtime 的方法，不承诺任意纯 Swift 方法。


### method 的参数与返回值转换

iOS 当前通过 `ObjC.implement` 创建 NativeCallback。此路径不经过 Objective-C bridge 高层的 `fromNative`／`toNative` 转换，与直接调用 `obj.someMethod_(...)` 或读写 `$ivars` 的转换行为不同。SDK 只移除 self／_cmd，然后将其余参数原样交给 filter／returnInstead；固定或函数计算出的返回值也原样交给 NativeCallback，按方法 ABI 转换。

| OC 类型 | filter／returnInstead 收到的参数 | 返回值要求与易错点 |
| --- | --- | --- |
| BOOL | number，通常为 0／1 | 使用 0／1；不把 JS true／false 自动转成数字 |
| id、NSString *、NSNumber * 等对象 | NativePointer；需要时自行 new ObjC.Object(pointer) | 使用有效对象指针或带 handle 的 ObjC.Object；JS 字符串、数字、JSON 不自动装箱成 OC 对象 |
| nil | 零地址的 NativePointer，使用 isNull() 判断 | 使用 NULL；JS null 不自动转成空指针。不要用指针对象的真假判断 nil |
| Block | NativePointer；需要时自行 new ObjC.Block(pointer)，缺少签名时需 declare | 返回有效 Block 指针／wrapper，不接受普通 JS 函数自动转 Block |
| SEL、Class | NativePointer | 使用 selector／类指针或兼容 wrapper；SEL 名称用 ObjC.selectorAsString 读取、ObjC.selector 创建 |
| 64 位整数 | 按解析后的 ABI 类型，int64／uint64 为 Int64／UInt64 | 返回对应 wrapper 或可准确表示的 number；不要不加判断地转 number。NSInteger 等须以实际方法签名为准 |
| char * 等 C 指针 | NativePointer，需按实际类型读取 | 返回有效内存指针，不自动把 JS 字符串分配成 C 字符串；调用方负责内存生命周期 |
| 按值结构体 | 按方法签名组成的数组，可嵌套 | 返回相同布局的数组，不是普通具名 JS 对象；仅限 Frida 支持的签名 |
| NSError ** 等输出指针 | NativePointer，指向用于写入结果的位置 | 需要时写入该地址；修改 JS 局部变量不会更新输出参数 |

filter 自身的返回值仍是 JS boolean：只有 true 才应用覆盖。上表中 BOOL 的 0／1 要求针对原方法参数与 returnInstead 返回值，不针对 filter 的判断结果。

例如原方法为 `- (BOOL)checkName:(NSString *)name enabled:(BOOL)enabled`：

```javascript
const removeCheck = await override.method(
  { className: 'Validator', selector: '- checkName:enabled:' },
  (name, enabled) => {
    const text = name.isNull() ? null : new ObjC.Object(name).toString();
    return text === 'test' && enabled !== 0 ? 1 : 0;
  },
);
await removeCheck();
```

NativeCallback 的返回值转换发生在 JS 回调返回之后；转换错误不由回调内部的 try/catch 捕获，也不保证回退原方法。对象／指针的有效期仍由其持有方式决定：当前 SDK 仅对固定的 ObjC.Object 返回值额外 retain，并在 remove 时 release；直接传 handle 或动态返回对象时，调用方须保证所需生命周期。

```javascript
const removeEnabled = await override.method(
  { className: 'FeatureFlags', selector: '+ isEnabled' },
  1,
);
const removePrice = await override.method(
  {
    className: 'PriceCalculator',
    selector: '- calculate:discount:',
    filter: (amount, discount) => amount > 100,
  },
  (amount, discount) => amount - discount,
);
await removePrice();
await removeEnabled();
```

不传 filter 时直接应用覆盖；提供 filter 时仅返回 true 才应用覆盖，其他结果调用安装前保存的 IMP。filter／返回值计算抛错时报告 callback_error 并调用保存的 IMP；重复覆盖时，它可能是上一层覆盖。ABI 转换错误和 Objective-C 异常不在此回退承诺内。

重复覆盖示例：

```javascript
const definition = { className: 'PriceCalculator', selector: '- calculate:' };
const removeFirst = await override.method(definition, 100);
try {
  const removeSecond = await override.method(definition, 200);
  try {
    await exploreApp(); // 当前返回 200
  } finally {
    await removeSecond(); // 恢复第一次覆盖，返回 100
  }
} finally {
  await removeFirst(); // 恢复最初的实现
}
```

## 2. field：通过属性 getter／setter 保存、设置和恢复

```typescript
interface FieldDefinition {
  instance: ObjC.Object;
  property: string;
}
override.field(definition: FieldDefinition, value: any): Promise<Remove>;
```

instance 必须是 Objective-C 实例 wrapper；property 是 OC 属性名（例如 title），不是 ivar 名（例如 _title）。读取 runtime property 元数据，有自定义 getter／setter 时使用指定名称，否则使用默认 getter 和 setXxx:。支持 runtime 可查到的继承属性；拒绝不存在的属性、readonly 属性和缺少访问方法的属性。不提供 className 分支，不支持仅有 ivar 而没有属性元数据的字段、类属性或未暴露到 OC runtime 的纯 Swift 属性。

安装调用 getter 保存旧值，再调用 setter 写入 value；remove 将保存的 getter 返回值传给 setter。调用 Frida 的 OC 方法 wrapper，参数和返回值经过 bridge 高层转换，因此 BOOL 可传 true／false，对象参数可按 bridge 规则传入 JS 字符串、数字、ObjC.Object 或 null，不额外维护值类型白名单。value 是直接值，不解释为回调。与 method 的 NativeCallback 转换边界不同。

```javascript
const remove = await override.field(
  { instance: configObject, property: 'enableSearch' },
  true,
);
await remove();

const restoreTitle = await override.field(
  { instance: page, property: 'title' },
  '临时标题',
);
await restoreTitle();
```

引用管理与清理：

- setter 自己负责 strong／weak／copy 语义，SDK 不直接写 ivar，也不调用 objc_storeStrong／objc_storeWeak。
- SDK retain instance 和 getter 返回的 ObjC.Object，在 remove 后释放。即使旧值来自 weak 属性，也统一强持有，可能延长旧对象的生命周期，不保存 weak 备份。
- 新值按 setter 的行为持有，SDK 不额外强持有新值；weak 属性不会因此变成 strong。原始指针等值的生命周期仍由调用方负责。
- 同一实例的同一 setter 不允许重复覆盖。remove 只执行一次；恢复抛错也会释放 SDK 引用并传播错误，不重试。
- 安装和恢复都会执行 setter 的业务逻辑，不撤销通知、计数、UI 更新等副作用。getter 可能提供计算结果，setter 可能复制或规范化值，因此不保证恢复底层对象身份或全部业务状态。
- App 期间设置的新值可能被 remove 覆盖。setter 抛错前已经产生的副作用不自动回滚。需要主线程或其他特定线程的 accessor，调用方须在相应线程执行安装和 remove。

## 3. code：在源码位置或地址处干预

```typescript
type CodeDefinition =
  | { kind: 'source'; file: string; line: number; condition?: string }
  | { kind: 'address'; address: string; condition?: string };

override.code(
  definition: CodeDefinition,
  overrides?: Record<string, string>,
  earlyReturn?: string,
): Promise<Remove>;
```

### 定位与条件

override.code 与 inspect.code 共用按需建立的 LLDB 会话，无需显式 attach。首次 attach 暂停时配置共享 callback，后续注册通过 LLDB breakpoint name 复用，不额外以 Stop/Continue 包装注册／remove；remove 只删除自身断点，不 detach；Host 在脚本销毁或连接关闭时清理共享会话。底层记录直接采用 capture、精简 CodeFrame 和 `{ ok, data, error }`，不保留旧 debugger 格式。

source 使用 Host 上的绝对源码路径与正整数行号；address 使用十六进制执行地址，必须能解析到已加载映像。注册必须有已解析的可执行位置。不使用 className／instance 定位，也不要求先取得对象。

condition 为非空原生表达式字符串，直接交给 LLDB SetCondition，在命中现场求值。它不是 JS 回调，变量、self／this 的可用性取决于当前语言和执行帧。条件错误记录为 condition 阶段错误，跳过本次干预；不能重复求值条件，以免重复副作用。

涉及覆盖或提前返回的注册，不允许与已有 code 注册共享已解析的执行地址（包括 inspect.code）。安装时直接报错，不根据 condition 推断是否互斥；纯观测之间可以共享地址。检查仅覆盖注册时已解析的位置。

### 覆盖与提前返回

overrides 的键为 LLDB 可解析的赋值目标，值为非空原生表达式。执行 `目标 = (表达式)`，右值执行一次。支持变量、成员以及语言允许的 property／下标；是否可写、类型兼容性和优化后的可用性由 LLDB 与目标语言决定。

```javascript
// Objective-C 示例，price/discount 在该位置可见
const remove = await override.code(
  {
    kind: 'source',
    file: '/project/PriceCalculator.m',
    line: 42,
    condition: 'price > 100 && discount > 0',
  },
  { discount: '0' },
  'price - discount',
);
await remove();
```

与 Android 不同，`'price * 0.8'` 是待执行的原生表达式，不是字符串字面值；赋字符串需要写目标语言字面量语法。不支持 JS 值工厂回调。

- earlyReturn 为字符串：求值原生表达式，将结果交给 LLDB ReturnFromFrame；表达式需产生符合原生返回类型的值，例如 Swift 的 `Int32(42)`。
- 不传或 undefined：不提前返回。
- 不接受 JS null。Objective-C 空对象返回使用 `'(id)nil'`；其他返回类型使用对应语言和类型的原生表达式，不增加 JS null 适配。
- void 提前返回使用平台表达式，例如 Objective-C 的 `'(void)0'` 或 Swift 的 `'()'`，仍受 LLDB 对当前帧的支持限制。

```javascript
// 只修改现场，不提前返回
const removeChange = await override.code(definition, { price: 'price * 0.8' });
await removeChange();

// Objective-C 空对象返回的表达式写法；当前提前返回存在下述已知限制
const removeEmpty = await override.code(objectResultDefinition, undefined, '(id)nil');
await removeEmpty();
```

### earlyReturn 已知问题（待修复）

当前不能保证表达式求值成功、LLDB ReturnFromFrame 未报错时，调用方就能收到正确返回值。以下问题已在 macOS ARM64、LLDB `lldb-1703.0.31.2` 的宿主验证中复现，尚未完成 iOS 设备验证：

| 返回类型／场景 | 实测结果 |
| --- | --- |
| Objective-C 类方法的 int、double、BOOL | 本次用例分别正确返回 200、3.5、0，不代表这些类型的所有场景均已验证 |
| Objective-C 类方法的 long long | 预期 LLONG_MAX，调用方实际收到错误值 |
| Objective-C 类方法的对象 | 预期指定 NSString，实际收到类对象地址 |
| Swift 函数的 Int | 预期 200，调用方实际收到错误值 |

上述失败在原停止事件分发与直接 callback 执行路径均出现，属于 override.code 的提前返回问题，不是 inspect.code 的采集限制，也不是切换 callback 引入的问题。根因尚未确定；`'(id)nil'` 等示例仅说明表达式语法，不能视为当前返回行为已通过验证。修复前不应依赖上述失败场景；验证提前返回必须检查调用方实际收到的值，不能仅检查 API 的 ok。

复现与对照结果见 [iOS code 条件与 callback 调查](./ios-code-condition-investigation.md#callback-直接承接-hit-的验证)。

返回 remove 闭包。顺序为 condition → overrides → earlyReturn。普通覆盖失败逐项记录，不回滚成功项，仍尝试提前返回；表达式超时、执行帧失效等不安全状态可能终止调试会话。remove 停止未来干预，不撤销已发生的修改。
