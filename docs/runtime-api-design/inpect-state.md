# 状态读取 — 直接使用 Frida

[返回 inspect](inspect.md) · [返回总览](README.md)

## 1. 设计结论与范围

变量、对象字段、集合等状态直接使用 Frida 读取，不新增 `inspect.state` 或 `state.read` 包装。调用方根据业务选择对象和字段，直接使用读取结果进行分析、断言或保存。

本文不包含 UI 状态、元素属性、UI 树或截图；`inspect.ui` 单独讨论。本文也不改变已 review 的 log、method、code 契约。

示例是注入进程内的 Frida JavaScript，不是 Host Node.js 代码。类名、字段名、对象和地址均为示意，需按目标 App 替换；未在目标设备验证。模块化脚本使用对应 bridge 导入；已有 Java/ObjC 绑定的执行环境无需重复导入。

## 2. Android：静态字段与实例字段

```javascript
import Java from 'frida-java-bridge';

Java.perform(() => {
  const Config = Java.use('com.example.Config');
  const enabled = Boolean(Config.debugEnabled.value);
  send({ enabled });
});
```

实例字段通过已有对象读取：

```javascript
// 在有效 Java 执行上下文中；model 是已定位的 Java wrapper。
const loading = Boolean(model.loading.value);
const error = model.error.value;
const errorText = error === null ? null : String(error);
```

- 字段用 `.value`；方法直接调用，例如 `model.isLoading()`。
- 字段与方法同名时，Frida 字段访问使用带下划线的名称，例如 `model._loading.value`。以实际 bridge 暴露结果为准。
- Kotlin 属性应按编译后的字段或 getter 访问，不能假定源码属性一定有同名字段；混淆、继承和 ClassLoader 也会影响定位。
- getter 是方法执行，可能触发计算、懒加载或其他业务行为。字段读取与 getter 调用不能视为完全相同。

## 3. Android：定位与探索对象

优先从已知静态入口、已有对象的持有关系，或 method capture 中的 receiver/参数取得对象。没有明确入口时，可以扫描指定类的存活实例：

```javascript
Java.perform(() => {
  Java.choose('com.example.SearchModel', {
    onMatch(model) {
      send({
        className: model.$className,
        loading: Boolean(model.loading.value),
      });
    },
    onComplete() {},
  });
});
```

扫描可能找到多个实例，也可能没有实例；不能默认第一个实例就是业务当前使用的对象。应结合业务标识或已知持有关系筛选。多 ClassLoader 场景需选择正确的 `Java.ClassFactory`，通过对应 factory 使用 `use` / `choose`。

不知道有哪些字段时，可以调用 Java 反射获取声明信息：

```javascript
// model 是已取得的对象；在有效 Java 执行上下文中执行。
const fields = model.getClass().getDeclaredFields();
const declarations = [];
for (let i = 0; i < fields.length; i++) {
  declarations.push({
    name: String(fields[i].getName()),
    type: String(fields[i].getType().getName()),
  });
}
send(declarations);
```

`getDeclaredFields()` 只列出当前类声明的字段；父类字段需沿 superclass 继续查询。发现字段信息不等于递归读取字段指向的整个对象图。

## 4. Android：集合与有限投影

按实际类型调用集合 API，只取调查所需的数据：

```javascript
// 假设 model.results 是 java.util.List<String> 字段。
const raw = model.results.value;
let results = null;
if (raw !== null) {
  const list = Java.cast(raw, Java.use('java.util.List'));
  const size = Number(list.size());
  const items = [];
  for (let i = 0; i < Math.min(size, 20); i++) {
    const item = list.get(i);
    items.push(item === null ? null : String(item));
  }
  results = { size, items, truncated: size > items.length };
}
send({ results });
```

业务对象列表应显式提取需要的字段，不默认用 `toString()` 代替结构化状态。集合可能在读取过程中改变；采集线程与同步方式应遵循业务模型，必要时调用业务已有的复制方法。读取数量限制不能提供一致性保证。

## 5. iOS：Objective-C 对象与实例变量

```javascript
import ObjC from 'frida-objc-bridge';

// 假设 App 提供 +[SearchStore sharedStore]。
const store = ObjC.classes.SearchStore.sharedStore();
const snapshot = {
  className: store.$className,
  loading: Boolean(store.$ivars._loading),
  // isReady 是方法调用，不是直接读取实例变量。
  ready: Boolean(store.isReady()),
};
send(snapshot);
```

`$ivars` 暴露实例变量，`$methods` / `$ownMethods` 提供方法名。Objective-C 属性常通过 getter 访问，其名称与底层实例变量名称未必相同。

没有已知对象入口时，可用 `ObjC.choose` 发现候选实例：

```javascript
ObjC.choose(ObjC.classes.SearchStore, {
  onMatch(store) {
    send({ className: store.$className });
  },
  onComplete() {},
});
```

与 Android 一样，候选实例需要业务筛选。ObjC wrapper 不代表任意纯 Swift 对象都可通过 `$ivars` 读取；纯 Swift 类型、泛型和值类型需要针对实际运行时表示另行处理，本文不承诺通用展开能力。

NSArray / NSDictionary 使用原生集合方法读取。例如已知是 NSString 元素的 NSArray：

```javascript
// names 是已取得且非 nil 的 NSArray<NSString *>。
const count = Number(names.count());
const items = [];
for (let i = 0; i < Math.min(count, 20); i++) {
  items.push(String(names.objectAtIndex_(i)));
}
send({ count, items, truncated: count > items.length });
```

## 6. Native 内存中的值

知道有效地址、类型和布局时，可以直接读取：

```javascript
// address 是已确认有效的 NativePointer；偏移和类型来自目标结构布局。
const count = address.add(8).readU32();
const bytes = address.readByteArray(32);
send({ count }, bytes);
```

地址本身不携带业务字段含义。C/C++ 结构体布局、指针层级、长度及对象存活状态需要调用方确认；读取原始字节不等于自动解析任意 C++ 或 Swift 对象。

## 7. 原生引用与保存下来的状态

对象 wrapper 用于继续访问原生对象，不是历史快照。`Java.retain` 可以保留 Java wrapper 供后续使用，使用结束后通过 `$dispose()` 释放；保留对象不冻结字段。Objective-C 对象跨回调或异步边界使用时，也需要依据其所有权管理原生生命周期，不能只因 JS wrapper 仍存在就假定对象有效。

需要保存当时的值时，显式构造由普通值组成的数据：

```javascript
// 假设 model 是有效 Java 对象，字段类型为 boolean / int。
const snapshot = {
  loading: Boolean(model.loading.value),
  count: Number(model.resultCount.value),
};
send(snapshot);
```

后续 App 修改字段不会修改这里已经取出的 boolean / number。若把 `model` 或其集合 wrapper 放进对象里，则仍然包含活引用，不能当作独立快照。

- 保留真实 null；对象缺失、字段不存在和读取失败不应悄悄转换成 null 或默认值。
- 64 位整数可能超出 JavaScript 安全整数范围，需要精确保留时使用字符串等明确表示，不盲目转为 Number。
- 多字段读取发生在一段时间内，不保证原子性；同一次 JS 回调也不会冻结其他业务线程。
- 接入正确运行时不等于切换到业务所属线程。线程受限的对象应遵循业务调度约定。
- 不需要统一返回 envelope、证据 ID 或强制深拷贝；调用方按用途选择保存内容。

## 8. 与 method / code 的边界

| 需要读取的内容 | 使用方式 |
| --- | --- |
| 存活对象字段、静态字段、集合 | 直接使用 Frida |
| 某次调用的 receiver、参数、返回值 | 在 inspect.method 对应 capture 回调中读取 |
| 某一代码位置的局部变量 | 使用平台 inspect.code 契约及其 debugger 后端 |
| 指定地址的数值、字节 | 在地址和布局已知时使用 Frida 内存读取 |

Frida 不能仅凭源码局部变量名，随时读取某次调用的局部状态。局部变量需要有效执行现场，并受作用域、优化和调试信息影响。方法返回后，未采集的局部值不能补读。

`watcher.current()` 只返回已采集记录，不会重新读取 App 当前状态。现有 method 与 Android code 允许返回原生 wrapper，生命周期仍以专项文档为准，本文不增加 JSON 化或深拷贝要求。

## 9. 参考

- [Frida JavaScript API](https://frida.re/docs/javascript-api/)：Java / ObjC bridge、对象发现、生命周期与 NativePointer 读取。
- [Frida Android 示例](https://frida.re/docs/examples/android/)：字段 `.value`、字段与方法同名处理。
- [Frida iOS 示例](https://frida.re/docs/examples/ios/)：Objective-C 调用、集合及内存读取。
- [inspect.method](inspect-method.md)、[Android inspect.code](inpsect-code-android.md)、[iOS inspect.code](inspect-code-ios.md)。
