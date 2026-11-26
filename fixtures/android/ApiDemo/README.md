# Android SDK ApiDemo

Dedicated fixture App for packaged MobileEasyUse Android SDK capability tests.

Build the injected Android SDK bundle, publish the integration AAR, then build with ApiDemo's
Gradle 8.11.1 wrapper:

```bash
npm --prefix ../../.. run build:android
../../../integration/android/gradlew -p ../../../integration/android \
  :mobile-easy-use:publishReleasePublicationToLocalRepository
./gradlew :app:assembleAutoDebug
```

The normal test package is `com.agenteasyuse.mobileeasyuse.apidemo`. The manual flavor uses
`.manual`; the SDK-free release flavor uses `.none`.

`MainActivity` exposes Input, UI, R / Resources, Wait, Window, Override, and Evidence items.
SDK regression tests live in `tests/` and run through `test/e2e/run.mjs`.
`probe/` retains only presets validation and Android-specific investigations; see its [README](probe/README.md).

## 自动化 Test 套件

主要流程的预期断言、分组执行和 Test API 用例见 [tests](tests/)。
