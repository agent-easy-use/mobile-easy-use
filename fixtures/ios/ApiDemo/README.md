# iOS SDK ApiDemo

Dedicated Objective-C/UIKit fixture App for packaged MobileEasyUse iOS SDK capability tests.
It is not a product-flow sample and does not reuse HelloWorld state or screens.

## Coverage baseline

The checked-in Module operations currently provide 49 actual-runtime probes:

| Capability | Operations |
| --- | ---: |
| Runtime status / `callFunction` | 2 |
| `IOS.ui.find` | 4 |
| `IOS.input` | 10 |
| `IOS.wait` | 8 |
| `Override.run` | 4 |
| State / UI / Chain Evidence | 19 |
| Window / Driver-failure screenshots | 2 |

`evalScript`, preset loading, connection concurrency, and detach/reconnect are transport-level
contracts. They are covered by the repository MCP tests and must be exercised as separate Agent
operations; they are intentionally not hidden inside a `callFunction` probe.

## Integration shape

The local `MobileEasyUse` Pod is resource-only and scoped to `ProbeDebug`. Its after-compile script
phase copies and signs the platform `MobileEasyUse.dylib` bridge, the separate
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

See `probe/README.md` for the one-operation execution contract.

## Release boundary

The resource-only Pod is enabled only in `ProbeDebug`; MobileEasyUse source is never compiled into
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
