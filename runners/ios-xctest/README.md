# MEUStandaloneRunner

`MEUStandaloneRunner` is an independent XCTest UI runner. Its Frida runtime listens on a port chosen
by the Host (`8485` is preferred).
The Host-side `ios-controller` launches the Runner, opens a second Frida Session, loads the XCTest
driver bundle, and forwards target-App `IOS.input` requests to it. The target App project is not linked
to this XCTest bundle, and the public MCP tool contract does not expose the Runner.

The Runner uses `code_signing: required` and does not install hooks. The target App's existing Frida
session remains the main script, Override, and Evidence runtime.

## Automatic start

The target App must already be running. After MCP `connect` validates the App runtime, the Host starts
the internal Runner script for the selected simulator or physical device and stores the Runner on
that connection. Users do not start or retain a separate Runner process, and no public Runner command
is exposed.

The Host resolves the Runner artifact from `MOBILE_EASY_USE_IOS_RUNNER_ROOT` when explicitly set.
Otherwise it reads the installed MobileEasyUse package version and requires
`<MEU_HOME>/ios/<version>/runner`, where `MEU_HOME` defaults to `~/.meu`. Missing artifacts fail
immediately; the runtime does not download an artifact or fall back to the repository checkout.

The command builds into a destination-specific directory under `.derived-data/` when no compatible
signed Runner is cached, then runs `testServeInputCommands` until the command is stopped. A cached
Runner is reused when its static inputs, destination, listen port, Xcode version, Team, signature,
and provisioning remain valid.

For a physical device, configure the signing team once in the Host environment:

```bash
export MOBILE_EASY_USE_IOS_DEVELOPMENT_TEAM="<APPLE_TEAM_ID>"
```

The ordinary MCP `connect` remains unchanged. For a USB device, the Host Controller also owns an
`iproxy` from a reserved local port to device port 8485 for the Runner Session; callers only maintain
the target App's normal 8484 forwarding. Disconnecting the App Session also stops the Runner and its
forwarding.

The Host reserves a separate local port for every active Runner. Physical devices keep device port
8485 and receive distinct Host forwarding ports; Simulators receive distinct listen ports because
their processes share the Mac's network namespace. One active Runner is allowed per destination.

On both a physical device and a simulator, the XCTest bundle loads the embedded signed
`MobileEasyUseRuntime.dylib` directly before serving commands. The Host then connects to its reserved
port; the Runner does not use LLDB or the target-App `MobileEasyUse.dylib` bridge.

The Runner owns a separate Frida Gadget `17.9.11` under `Binaries/`. Do not replace it with the
target-App runtime from `integration/ios`: the target App uses the newer runtime where supported,
while the standalone Runner stays on `17.9.11` to avoid the unserviced `brk 1337` initialization path.

## Input contract

The target App SDK sends one of these serializable targets through `requestController`:

```js
"loginButton"
["identifier::form", "label::Login"]
{ x: 120, y: 360 }
```

It also accepts a native `UIView`; only that form is resolved in the target App, on its main thread,
to the View's current screen-center point. The Runner resolves identifier/label paths directly through
the XCTest Accessibility tree. `class::` is intentionally unsupported.

Supported actions are `click`, `input`, `scroll`, and `longPress`. Runner operations are serialized,
performed on the XCTest main thread, and never call `XCUIApplication.launch()`.
After loading the dynamic driver, the Host binds it to the App ID owned by the originating connection.
The Host then forwards each Input request to that sole Runner; the `.xctestrun` contains no target App ID.

## Manual build

```bash
cd runners/ios-xctest
npm --prefix ../.. run build:ios-runner
xcodebuild build-for-testing \
  -project MEUStandaloneRunner.xcodeproj \
  -scheme MEUStandaloneRunner \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .derived-data
```

The reusable products are below `.derived-data/<destination-key>/Build/Products`:

- `Debug-iphonesimulator/MEUStandaloneRunner-Runner.app`
- `MEUStandaloneRunner_*.xctestrun`

For a physical device, use a concrete `platform=iOS,id=<DEVICE_UDID>` destination together with
`DEVELOPMENT_TEAM=<TEAM_ID> -allowProvisioningUpdates`. Xcode signs the Runner, XCTest bundle, and
embedded Runtime with that Team's development identity and provisioning profile.
