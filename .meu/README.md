# ApiDemo presets

配置位于 `config.json`，基目录为 `.meu/presets`，Android/iOS 自动使用各自子目录。
在仓库根目录启动 MCP；这些 presets 仅面向对应平台的 ApiDemo。

双端都导出三个只读能力：

- `inspectRuntime()`：运行平台、App ID 和集成版本。
- `inspectPageState()`：首页状态及 ApiDemo 的场景、计数等状态。
- `inspectElement(identifier)`：单个控件快照；未找到返回 `null`。
  Android 使用资源名（如 `api_menu_ui`），iOS 使用 accessibility identifier（如 `api.menu.ui`）。

准确的参数、字段及限制见各功能的 `probe.d.ts`。入口只负责显式导出，修改源文件后从仓库根目录构建：

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

双端 `fixtures/<platform>/ApiDemo/probe/presets/probe.js` 的 `verifyPresets()`
在首页验证全部导出、缺失控件和非法参数。它通过 connect 加载的 bundle 导入能力，
不直接加载 presets 源文件。构建成功不代表设备验证通过。
