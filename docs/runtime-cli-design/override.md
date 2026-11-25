# override CLI — 基础命令与高级 apply

状态：设计讨论稿，尚未实现。已确定保留快捷命令作为基础能力；apply 作为高级能力，支持 JS 文件和 JS 源码字符串。具体选项名、脚本加载协议及资源状态结构为本稿提案。

API 依据：[override](../runtime-api-design/override.md)、[Android](../runtime-api-design/override-android.md)、[iOS](../runtime-api-design/override-ios.md)。

## 1. 命令分层

```text
override method ...
override field ...
override code ...

override apply --file <path> [--params <json-object>]
override apply --source <javascript> [--params <json-object>]

override list
override remove <overrideId>
```

method / field / code 提供常用覆盖的结构化快捷入口，不要求用户先写脚本。apply 承载函数、原生对象定位、动态值计算等完整 SDK 能力，不受快捷参数表达范围限制。

两种入口使用同一套安装与移除管理，均返回 overrideId。命令退出后覆盖继续生效。下文省略可执行文件名与连接选项；目标连接的选择沿用 CLI 公共约定。

## 2. 基础能力：快捷命令

### method

```bash
# Android：固定返回 boolean
override method --class com.example.FeatureConfig \
  --method isEnabled --argument-types '[]' --return 'true'

# iOS：BOOL 返回 ABI 数值 0/1
override method --class FeatureConfig \
  --selector '+ isEnabled' --return '1'
```

--return 使用 JSON 值编码，字符串需写 JSON 引号。值必须符合平台原方法类型，不能把任意 JSON 自动转换成 Java / Objective-C 对象。Android 重载选择沿用 argumentTypes 契约；iOS selector 包含 + / -。

filter、动态返回函数、需要构造的原生对象等通过 apply 表达。快捷命令是基础能力，不因提供 apply 而移除。

### field

```bash
# Android：静态字段
override field --class com.example.FeatureConfig --field enabled --value 'true'
```

--value 使用 JSON 值编码。Android 静态字段可以通过类名定位；Android 实例字段和 iOS property 需要原生实例，先通过 apply 定位并调用 API。不将 UI target 擅自扩展成任意业务对象定位语言。实例字段是否增加专门的快捷定位选项留待讨论。

### code

```bash
# Android：固定值覆盖
override code --class com.example.PriceCalculator --method calculate \
  --argument-types '["int"]' --line 42 --values '{"discount":0}'

# iOS：覆盖值与提前返回值是原生表达式
override code --file /project/PriceCalculator.m --line 42 \
  --values '{"discount":"0"}' --early-return 'price - discount'
```

Android --values 是变量名到固定值的 JSON 映射，--early-return 按 JSON 值解析；动态条件与值通过 apply 表达。iOS --values 是赋值目标到原生表达式字符串的 JSON 映射，--early-return 与可选 --condition 直接作为原生表达式；地址定位可使用 --address，与 file / line 定位互斥。

两端至少提供一个覆盖项或提前返回值。Android void 提前返回等无法直接用 JSON 表达的值通过 apply 使用。iOS code 仍要求先显式 attach debugger；CLI 自动管理 debugger 的方案另行定义。

## 3. 高级能力：apply

### 两种源码入口

```bash
override apply --file ./overrides/search.js --params '{"threshold":100}'

override apply --source 'export default function install() {
  return override.method(
    { className: "com.example.FeatureConfig", method: "isEnabled", argumentTypes: [] },
    true
  );
}'
```

--file 与 --source 必须且只能指定一个。文件路径相对 CLI 当前工作目录解析；--source 接收一个完整源码字符串。两者使用完全相同的脚本契约，不按来源切换成不同的表达式或函数体语法。

--params 为可选 JSON 对象，默认 {}，作为安装函数的参数传入。它仅承载可序列化数据，不将函数或原生对象作为 JSON 传递。

### 安装函数契约提案

脚本默认导出一个安装函数，接受 params，返回清理函数或 Promise<清理函数>：

```typescript
type Remove = () => void | Promise<void>;
type Install = (params: Record<string, JsonValue>) => Remove | Promise<Remove>;
```

```javascript
export default function install(params) {
  return override.method(
    {
      className: 'com.example.PriceCalculator',
      method: 'calculate',
      argumentTypes: ['int', 'int'],
      filter: (amount, discount) => amount > params.threshold,
    },
    (amount, discount) => amount - discount,
  );
}
```

安装函数在目标 App 的 SDK JS 运行时中执行，可以使用对应平台的原生 bridge 和线程助手，不在 CLI 的 Node.js 进程中执行。SDK API 的注入、模块编译与依赖加载细节需要在实现时确认；本例的默认导出是拟定的脚本协议，不代表当前加载器已支持。

安装函数可异步准备或安装 code 覆盖；方法命中时的 filter、动态返回以及 Android code 回调仍必须遵守 SDK 的同步执行契约，不等待 Host。

原生实例可以在安装函数中定位后传给 override.field；原生返回对象也在运行时构造。需要特定线程的安装和清理应由脚本显式调度，并返回包含相应调度的清理函数。

建议脚本顶层只声明定义，将安装副作用放在 install 中。默认导出缺失或类型非法时，在调用安装函数之前拒绝。安装函数返回非函数时报告契约错误，不能据此断言没有残留覆盖。

### 安装数量与失败

首版建议一次 apply 安装一个 SDK 覆盖并返回其清理函数。该限制是脚本契约，不是对任意 JS 的静态保证。

高级脚本若自行组合多个覆盖，必须自行处理部分安装失败时的逆序清理，并返回负责全部移除的清理函数；CLI 只把它视为一个资源，不自动发现内部安装的覆盖，也不承诺自动回滚任意脚本副作用。内建批量组合协议留待后续定义。

## 4. 跨命令资源生命周期

安装成功后返回示意：

```json
{ "ok": true, "overrideId": "ov-1" }
```

最终 envelope 遵循 CLI 公共协议。只有安装函数完成、清理闭包已保存并完成资源登记后，才能返回安装成功。

清理闭包和原生回调保存在持续存活的 SDK 运行时，控制端记录连接、运行时身份和资源 ID 的映射。不能把闭包序列化到 CLI 进程，也不能在短命 CLI 退出时卸载对应脚本。

```bash
override list
override remove ov-1
```

list 返回当前连接登记的覆盖及其状态，包括快捷命令与 apply 创建的资源。apply 的内部方法或字段定位不一定可自动提取，不伪造详细定位信息。

- remove 调用保存的闭包，等待同步或异步清理完成。并发请求应共用首次清理操作。
- 已成功移除的资源可以返回已移除结果；清理失败则保留失败状态与错误。当前 SDK 闭包不会重试失败步骤，不能通过再次调用空操作把失败改报成功。
- iOS 同方法的重复覆盖要求逆序移除。快捷命令可依据已知定位信息检查顺序；任意 apply 脚本无法自动推断冲突，调用方仍须遵守顺序。
- field 移除恢复保存的旧值，可能覆盖 App 后续写入；code 移除只停止未来干预，不撤销已经发生的修改。
- 连接或运行时丢失时，旧 ID 不得映射到新进程或重建的运行时。若无法确认清理结果，报告状态未知或资源失效，不能宣称已恢复。
- 安装响应丢失不能自动重放安装请求，需通过资源记录核对，避免重复覆盖。请求去重与异常关闭策略留给公共运行时管理设计。

## 5. 证据与待讨论项

安装成功表示覆盖已注册，不代表后续命中都成功。保留 SDK 的 override.callback_error 和 override.code 事件；remove 的返回不冒充命中记录。事件关联、持久化及查询入口另行定义。

后续需要收敛：

1. apply 默认导出协议、SDK 全局注入与 import 依赖范围。
2. 基础命令的最终选项名、平台值类型提示与实例字段快捷定位范围。
3. 资源登记、异常断连、清理失败和安装响应丢失时的公共管理协议。

本稿仅定义 CLI 设计，不修改 SDK override 的签名或返回方式。
