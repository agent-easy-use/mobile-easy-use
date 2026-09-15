# FIRST 按钮视觉基准

[查看基准图](class-first.jpg)

- 采集日期：2026-09-15。
- 场景：UI > class，目标 api.ui.class.first（Android 资源名 api_ui_class_first）。
- 原生状态已断言：按钮文字 FIRST，点击计数 0。
- 图片已目视检查，完整包含初始按钮，无 FIRST:1 或其他点击后状态。
- 设备配置：iPhone 17 Pro 模拟器；iOS 26.0；Dynamic Type=large（系统默认）；浅色模式。
- 裁剪尺寸：726 × 144 像素。
- SDK：MCP 0.1.2，原生集成 0.1.0。
- SHA-256：`5240d10baaed1f314927541e03f2e8f1c94772cde316a17eb97b9f4ed0d40345`。

这是从真实设备 SDK 截图取得的初始基准。测试重新进入场景，独立截图，再与此固定文件对比；
测试本身不更新基准。此基准适用于上述配置，其他设备、主题或字体配置应另建并检查基准。

运行 [screenshot.js](../screenshot.js) 的 `run()`；文件中的 `BASELINE` 指向此图的绝对 Host 路径，阈值为 0。

## 原基准验证记录（旧用例）

2026-09-15：以此固定文件为基准，重新进入场景并独立截图，`runVisualTest` 通过（1/1），
`maxDiffPixelRatio=0`。比较使用 SDK 默认颜色阈值 0.2，忽略抗锯齿差异。
