# FIRST 按钮视觉基准

[查看基准图](class-first.jpg)

- 采集日期：2026-09-15。
- 场景：UI > class，目标 api.ui.class.first（Android 资源名 api_ui_class_first）。
- 原生状态已断言：按钮文字 FIRST，点击计数 0。
- 图片已目视检查，完整包含初始按钮，无 FIRST:1 或其他点击后状态。
- 设备配置：华为 JAD-AL50 真机；Android 12；屏幕 1228 × 2700；密度 540 dpi；font_scale=1.0；浅色模式。
- 裁剪尺寸：297 × 176 像素。
- SDK：MCP 0.1.2，原生集成 0.1.0。
- SHA-256：`69cbc049308c31307a53dc65d76d63f9c79748412ca352d7a9707ef1d320e828`。

这是从真实设备 SDK 截图取得的初始基准。测试重新进入场景，独立截图，再与此固定文件对比；
测试本身不更新基准。此基准适用于上述配置，其他设备、主题或字体配置应另建并检查基准。

运行 [screenshot.js](../screenshot.js) 的 `run()`；文件中的 `BASELINE` 使用相对路径，由 MCP 按执行模块所在目录解析，阈值为 0。

## 原基准验证记录（旧用例）

2026-09-15：以此固定文件为基准，重新进入场景并独立截图，`runVisualTest` 通过（1/1），
`maxDiffPixelRatio=0`。比较使用 SDK 默认颜色阈值 0.2，忽略抗锯齿差异。

## 首页窗口基准

[查看 home-window.jpg](home-window.jpg)。2026-09-15 通过 SDK 单独采集并目视检查：ApiDemo 首页，菜单布局稳定，未进入场景。设备、主题和字体配置同上。

- 图片尺寸：1228 × 2700 像素。
- SHA-256：`035e5ce0659f59e7c394973a10041c42dc70ff974689f050a0dbfbe948b857bb`。
- [window-screenshot.js](../window-screenshot.js) 使用独立的新截图验证首页匹配、进入 UI 后不匹配；测试不更新此基准。
