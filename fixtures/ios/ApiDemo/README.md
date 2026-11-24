# iOS SDK ApiDemo

Dedicated Objective-C/UIKit fixture App for packaged MobileEasyUse iOS SDK capability tests.
It is not a product-flow sample and does not reuse HelloWorld state or screens.

## Regression coverage

SDK behavior is tested by `tests/drive`, `tests/element`, `tests/inspect`, `tests/override`,
and `tests/common` through `test/e2e/run.mjs`. Ordinary legacy probe modules have been retired.
See [migration decisions](../../../docs/testing/apidemo-probe-migration.md) for coverage and boundaries.
`probe/presets` remains a separate real-App presets smoke check.

## Integration shape

The `ProbeDebug` build uses a CocoaPods after-compile script phase to copy and sign
the platform `MobileEasyUse.dylib` bridge, the separate
`MobileEasyUseRuntime.dylib`, and `MobileEasyUseRuntime.config`. Neither dylib is linked by the App,
and no native bridge source is compiled into the App or Pods target. For both a simulator and a
physical device, MCP `connect` launches or preserves the App and uses LLDB to load the bridge and
Runtime synchronously. A simulator additionally waits for launch-time dyld work to settle.

## Build

```bash
ruby generate-project.rb
pod install
npm run build:ios
xcodebuild \
  -workspace ApiDemo.xcworkspace \
  -scheme ApiDemo \
  -configuration ProbeDebug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath .derived-data \
  build
```

Install the resulting App. Do not invoke the Loader separately; the first MCP `connect` launches or
preserves the App and loads both images before attaching Frida:

```bash
xcrun simctl install booted .derived-data/Build/Products/ProbeDebug-iphonesimulator/ApiDemo.app
```

The simulator Runtime endpoint is `127.0.0.1:8484`.

For a connected development device, build and install the device product, then prepare forwarding
before the first MCP `connect`:

```bash
xcodebuild \
  -workspace ApiDemo.xcworkspace \
  -scheme ApiDemo \
  -configuration ProbeDebug \
  -destination 'platform=iOS,id=<device-udid>' \
  -derivedDataPath .derived-data-device \
  clean build -allowProvisioningUpdates

xcrun devicectl device install app \
  --device '<device-udid>' \
  .derived-data-device/Build/Products/ProbeDebug-iphoneos/ApiDemo.app

iproxy -u '<device-udid>' 28484:8484
```

The physical-device Runtime endpoint is `127.0.0.1:28484`. The final App must be development-signed
with `get-task-allow = true`, or LLDB attachment will fail.

## Release boundary

The embed phase runs only in `ProbeDebug`; MobileEasyUse source is never compiled into
the App executable. Verify a production build with:

```bash
xcodebuild \
  -workspace ApiDemo.xcworkspace \
  -scheme ApiDemo \
  -configuration Release \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath .derived-data-release \
  clean build CODE_SIGNING_ALLOWED=NO
```

The Release App must contain no `MobileEasyUse.dylib`, `MobileEasyUseRuntime.dylib`,
`MobileEasyUseRuntime.config`,
`mobile_easy_use_*`, `MEUInput`, or `MEUUIQuery` artifacts/symbols.

## 自动化 Test 套件

主要流程的预期断言、分组执行和 Test API 用例见 [tests](tests/)。

## Debugger API fixture

OC/Swift breakpoint, observation, override, earlyReturn and lifecycle cases run
on the actual App. See [inspect.code design](../../../docs/runtime-api-design/inspect-code-ios.md) for simulator
and device execution, expectations and result reporting.
