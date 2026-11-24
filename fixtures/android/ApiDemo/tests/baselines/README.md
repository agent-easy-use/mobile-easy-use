# 固定视觉基准

2026-11-24 使用真实 SDK 在当前配置的模拟器采集，已目视检查：FIRST 按钮未点击、文字完整；首页菜单布局正常，无弹窗或键盘。

设备：ApiDemo_API_31 / emulator-5556；Android 12；1080 × 2280；440 dpi；系统默认字体；浅色模式。

| 基准 | 像素尺寸 | SHA-256 |
| --- | --- | --- |
| [class-first.jpg](class-first.jpg) | 242 × 143 | `0250b889d2178b190912032f1c6e4fa3f815a32abfcadc8ab4be345a8ebe730e` |
| [home-window.jpg](home-window.jpg) | 1080 × 2280 | `16b105ef28906eb48cb4227de6f715720861abaf72cdba999c958e5b703b30f8` |

- [元素视觉回归](../inspect/visual-element.js)：重新进入 class 场景，检查 FIRST 文字并与固定按钮图片比较。
- [窗口视觉回归](../inspect/visual-window.js)：首页匹配，切换至 UI class 页面后不匹配。
- `maxDiffPixelRatio=0`；使用比较器默认颜色阈值及抗锯齿处理。
- 基准路径通过 E2E 注入的 `__MEU_REPO_ROOT__` 定位，不依赖临时打包文件目录。
- 测试只读基准，不自动生成或更新。变更设备、系统、字体、主题或界面后，重新采集、目视审核，再显式替换并更新本说明。不要以更新基准掩盖非预期变化。
- 旧设备基准已替换；不声称这些图片适用于其他设备配置。

运行：

```sh
npm run test:e2e -- --platform android --suite inspect/visual-element
npm run test:e2e -- --platform android --suite inspect/visual-window
```
