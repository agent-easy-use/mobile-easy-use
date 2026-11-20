# Android override — API 说明

[返回 override 总览](override.md)

本文描述 Android overrides 当前实现。根导出与类型声明尚未接入；返回函数、错误与清理规则见[总览](override.md#3-返回与移除)。Java 值遵循 Frida bridge 的类型转换规则。

## 1. method：替代方法执行

```typescript
interface MethodDefinition {
  className: string;
  method: string;
  argumentTypes?: readonly string[];
  filter?: (...args: any[]) => boolean;
}
override.method(definition: MethodDefinition, returnInstead: any): Promise<Remove>;
```

- className 指定类名。静态与实例方法采用同样的定位形式，不做接收者身份筛选；实例方法覆盖作用于所有派发到该方法实现的调用。
- 所选方法已有 implementation 时直接报错，不维护额外冲突集合；code 不参与检查。
- argumentTypes 指定完整运行时参数类型；存在重载歧义时必填。
- filter 仅筛选原参数，按原方法参数顺序传入，不承担实例选择。不传时覆盖目标的所有调用。
- returnInstead 是直接返回值或 `(...args) => value` 同步函数；参数同原方法，使用 Frida 转换后的 Java 参数类型。
- 返回值必须兼容原方法返回类型。对象使用 Java.Wrapper，long 等按 Frida 类型规则处理，不自动把普通 JSON 对象变成 Java 对象。
- 成功匹配后不执行原方法；不提供调用原方法后加工结果或改参数的能力。


### method 的参数与返回值转换

Android 使用 Frida Java bridge 的 `.implementation`：参数先经过 `fromJni` 转换，再交给 filter／returnInstead；回调返回后，由 bridge 校验返回类型并通过 `toJni` 转换。固定 returnInstead 同样经过返回值校验和转换，SDK 不另建值转换规则。

| Java 类型 | 回调参数／返回值表示 |
| --- | --- |
| boolean | JS boolean，可直接返回 true／false |
| byte、short、int、float、double | JS number，须符合原类型的范围和要求 |
| char | 长度为 1 的 JS 字符串 |
| long | 参数通常为 Int64；返回可使用 Int64 或 number，大整数需避免精度损失 |
| String | 默认 bridge 配置下参数转换为 JS 字符串；返回接受 JS 字符串或兼容的 Java wrapper |
| 普通引用类型 | Java wrapper 或 null，须兼容声明类型 |
| 数组 | 按 bridge 数组规则处理；返回可使用元素兼容的 JS 数组或 Java.array 创建的数组 |

这里的“经过转换”不表示任意 JS 值都可使用：普通 JS 对象不会自动转换成 Java 对象，JS 数字不会自动装箱成任意 Java 包装类。引用参数仍须遵守 Frida 的生命周期规则，若要跨调用保存，应使用 Java.retain。

```javascript
// 静态方法
const removeEnabled = await override.method(
  { className: 'com.example.FeatureConfig', method: 'isEnabled', argumentTypes: [] },
  true,
);

// 通过类名定位实例方法
const removePrice = await override.method(
  {
    className: 'com.example.PriceCalculator',
    method: 'calculate',
    argumentTypes: ['int', 'int'],
    filter: (amount, discount) => amount > 100,
  },
  (amount, discount) => amount - discount,
);
await removePrice();
await removeEnabled();
```

不传 filter 时直接应用覆盖；提供 filter 时仅返回 true 才应用覆盖，其他结果执行原方法。filter／返回值计算抛错时报告 callback_error 并执行原方法。返回值仍须符合原生类型，转换失败不保证回退。remove 恢复原方法并释放持有的返回对象引用。

## 2. field：静态或实例字段的一次写入

```typescript
type FieldDefinition =
  | { className: string; instance?: never; field: string }
  | { instance: Java.Wrapper; className?: never; field: string };
override.field(definition: FieldDefinition, value: any): Promise<Remove>;
```

className 与 instance 必须且只能提供一个。className 指定静态字段所属类；instance 指定实例字段所属对象，必须为 Java 实例 wrapper，不能为类 wrapper。实例已包含类型信息，无需同时传入类名。目标字段的静态／实例类别必须与所选分支一致；不提供 filter。

value 是实际写入值，按 Frida Java 字段类型转换，不把函数隐式解释为计算回调；需要计算时由调用方先计算。

```javascript
const removeStaticFlag = await override.field(
  { className: 'com.example.FeatureConfig', field: 'enabled' },
  true,
);
const removeInstanceFlag = await override.field(
  { instance: configObject, field: 'enableSearch' },
  true,
);
await removeInstanceFlag(); // 恢复保存的旧值
await removeStaticFlag();
```

安装时通过 Frida `.value` 读取并保存转换后的旧值，然后通过 `.value` 写入新值；remove 通过 `.value` 写回旧值并释放持有的引用。不再使用反射保存原对象身份：String、数组等按 bridge 的读取与写入规则恢复，不额外保证转换前后的对象身份，也不对对象内容做深拷贝。不能保证覆盖期间 App 不会再次写字段。

## 3. code：在方法内的指定位置干预

```typescript
interface CodeContext {
  get(name: string): any;
}
interface CodeDefinition {
  className: string;
  method: string;
  argumentTypes?: readonly string[];
  fileLine: number;
  condition?: (context: CodeContext) => boolean;
}
override.code(
  definition: CodeDefinition,
  overrides?: Record<string, any>,
  earlyReturn?: any,
): Promise<Remove>;
```

签名中的 any 表示实际值取决于目标 Java 类型，并非任意值都合法。overrides／earlyReturn 的函数形式为 `(context: CodeContext) => value`，必须同步执行。

### 定位与条件

className、method、argumentTypes 解析具体方法，fileLine 定位该方法内的源码行。静态与实例方法采用相同定义，不接受实例参数，也不因指定类名而只匹配静态方法。

沿用当前 debugger 边界：需要 debuggable Android API 28+ App 和 SDK AAR；精确行号映射到该方法对应行的最小 jlocation，无最近行回退。不支持构造器、类初始化器以及 Kotlin inline/协程逻辑帧重建。

condition 接收 `{ get }`，必须同步返回 boolean，不接受 Promise 或其他 truthy 值。省略条件每次均干预；false 跳过，抛错或返回非 boolean 记录 condition 错误并跳过。

get 读取当前帧参数／局部变量，随后按当前解析规则尝试实例字段；`get('this')` 获取接收者，静态方法无 this。缺失调试信息、名称歧义或变量不可用均报错。只接受名称，不解析 `order.price` 等路径或表达式。get 及临时 wrapper 仅在当前命中期间有效。

### 覆盖与提前返回

- overrides 的键是参数、局部变量或实例字段名，不支持成员路径和下标；禁止覆盖 this。
- 值是直接值或 `({ get }) => value`；例如字符串是字面值，不是待执行代码。
- 底层通过 JVMTI 写局部变量、JNI 写实例字段，通过 Frida 做类型兼容检查与转换。
- earlyReturn 是直接值或 `({ get }) => value`；不传／undefined 不提前返回，null 提前返回空引用，仅适用于兼容的返回类型。
- void 提前返回使用 `() => undefined` 明确表达。函数存在表示要提前返回，函数结果 undefined 按 void 类型处理，不代表跳过。

```javascript
const definition = {
  className: 'com.example.PriceCalculator',
  method: 'calculate',
  argumentTypes: ['int'],
  fileLine: 42,
  condition: ({ get }) => get('price') > 100,
};

const remove = await override.code(
  definition,
  { discount: ({ get }) => get('price') * 0.1 },
  ({ get }) => get('price') - get('discount'),
);
await remove();

// 只提前返回；该位置所在方法必须允许返回空引用
const removeEmpty = await override.code(objectResultDefinition, undefined, null);
await removeEmpty();
```

返回 remove 闭包。condition → overrides → earlyReturn；普通覆盖错误逐项记录，不回滚成功项，也不阻止继续尝试 earlyReturn。移除只停止未来干预，不恢复已经写入的值。
