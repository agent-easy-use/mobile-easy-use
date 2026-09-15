# SDK 静态 Hook 的初始化规避

真机：HUAWEI JAD-AL50，Android 12 arm64，Frida 17.16.4 / frida-java-bridge 7.0.12。

同一 `integer(int)`，先读取同类计数器、再安装 Hook，分别冷启动对照：

| 安装前处理 | Frida 保存的原入口 | Hook / 原方法次数 | 结果 |
| --- | --- | --- | --- |
| 不处理 | `art_quick_resolution_trampoline` | 2 / 0 | 深度 2 被诊断保护截断 |
| 完成 ART 可见性处理 | `art_quick_to_interpreter_bridge` | 100 / 100 | 深度 1，全部返回 12 |

ART 在 ARM 上会延迟、批量完成类初始化的跨线程可见性和静态入口更新。
只执行 `Class.forName(..., true, ...)` 或预调用业务方法，不等于完成这一步。
SDK 在安装静态 implementation 前初始化声明类，然后调用
`ClassLinker::MakeInitializedClassesVisiblyInitialized(thread, true)` 等待完成。
这样 Frida 保存的原入口不再经过本次异常的 resolution → interpreter 二次分流。

实现位于 `sdk/android/common/static-hook.js`，由 `Override` 和调用链探查共用。
限定 ARM Android 11+；不更改 Frida 依赖、不修改 ArtMethod 内存、不做全局去优化。
符号不可用时打印警告，跳过准备并继续安装 Hook；此时未应用本规避。
该调用在 JNI native 状态等待，不能放进持有 mutator lock 的 `withRunnableArtThread`。
每次安装都完成可见性处理，只缓存函数地址，不缓存类已准备状态。

## 验证

- 独立 bridge：普通、同步、重载、既有 `staticValue`，7 组 × 100 次全部通过。
- SDK：`Override`、调用链、过滤回退、回调异常回退和原方法异常，9 组 × 100 次通过。
- 两种 SDK 路径的 `recursive(2)` 均为 Hook 300 次、原方法 300 次，参数 `2 → 1 → 0`；正常递归保留。
- 相关主机测试 80 项通过，Android SDK 构建通过。

每个用例冷启动 ApiDemo、connect 后调用 `verify-sdk.js` 的 `verifyStaticHookFix`，例如：

```js
{ api: 'chain', key: 'recursive', trigger: 'java' }
```

完整结果见 [sdk-fix-results.json](sdk-fix-results.json)。必须同时检查 Hook 次数、原方法次数和返回值，不能把漏 Hook 计为成功。

## 尚未解决的边界

`Java.scheduleOnMainThread` 回调内通过 Java 调用点触发时，当前设备仍有 Hook 0 次、原方法 100 次的现象。
**未使用本规避的原版 bridge 对照也为 0 / 100**，不是本次改动新引入的现象。
主线程直接调用目标 wrapper 则为 100 / 100。`Interceptor.flush()`、`traps: 'all'` 均未改善前者。
这是仍待定位的漏 Hook 路径；本修改解决已复现的异常重入，不能据此宣称所有线程、设备和 ART 版本都完全解决。

源码依据：[ART Android 12](https://android.googlesource.com/platform/art/+/refs/heads/android12-release/runtime/class_linker.cc)、
[YAHFA 的可见性初始化说明](https://github.com/PAGalaxyLab/YAHFA#setup)。
