# mobile-easy-use iOS SDK

生成 probe script 的唯一 API 契约是 [index.d.ts](./index.d.ts)。全部公开入口、参数、返回值、
线程边界、平台限制和最小示例均在该文件维护。修改功能时同步更新声明。

SDK 在被测 App 的 Frida runtime 中运行，使用 `frida-objc-bridge`。构建 bundle：

```bash
npm run build:ios
```

不能直接加载未打包的 `index.js`。目标侧原生桥接的构建、加载方式参见
[集成说明](../../integration/ios/README.md)；独立 XCTest 输入 Runner 的运行方式参见
[Runner 说明](../../runners/ios-xctest/README.md)。

可执行的场景验证见 [ApiDemo probes](../../fixtures/ios/ApiDemo/probe/README.md)。
