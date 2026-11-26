# ApiDemo presets

配置位于 `config.json`，基目录为 `.meu/presets`，Android/iOS 自动使用各自子目录。
在仓库根目录启动 MCP；这些 presets 仅面向对应平台的 ApiDemo。

双端都导出三个只读能力：

- `inspectRuntime()`：运行平台、App ID 和集成版本。
- `inspectPageState()`：首页状态及 ApiDemo 的场景、计数等状态。
- `inspectElement(identifier)`：单个控件快照；未找到返回 `null`。
  Android 使用资源名（如 `api_menu_ui`），iOS 使用 accessibility identifier（如 `api.menu.ui`）。

准确的参数、字段及限制见各功能的 `index.d.ts`。入口只负责显式导出，修改源文件后从仓库根目录构建：

```bash
node skills/to-android-presets/scripts/build-presets.mjs
node skills/to-ios-presets/scripts/build-presets.mjs
```

重新连接 MCP 后，通过 Module 导入使用：

```js
import { inspectPageState } from '/meu/presets.js';

export async function inspect() {
  return await inspectPageState();
}
```

实现使用公开的 `element.findUiView` 解析控件，再通过 `common.runOnMainThread` 读取原生属性；返回可 JSON 化的数据。控件查找和属性读取是分开的主线程操作，并非原子快照。

本次迁移的构建和静态检查不代表设备验证通过。此前运行结果见 `VALIDATION.md`，不能作为当前版本的验证结果。
