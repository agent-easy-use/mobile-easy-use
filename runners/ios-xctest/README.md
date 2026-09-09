# MEUStandaloneRunner

`MEUStandaloneRunner` is an independent XCTest UI runner. Its Frida runtime listens on a port chosen
by the Host (`8485` is preferred).
The Host-side `ios-controller` launches the Runner, opens a second Frida Session, loads the XCTest
driver bundle, and forwards target-App `IOS.input` requests to it. The target App project is not linked
to this XCTest bundle, and the public MCP tool contract does not expose the Runner.

The Runner uses `code_signing: required` and does not install hooks. The target App's existing Frida
session remains the main script, Override, and Evidence runtime.

## Automatic start

Before loading the App runtime, MCP `connect` resolves the device and signing configuration. After validating the App runtime, the Host starts
the internal Runner script for the selected simulator or physical device and stores the Runner on
that connection. Users do not start or retain a separate Runner process, and no public Runner command
is exposed.

The Host reads `runtimeStatus.releaseVersion` from the target App's dylib and requires
`<MEU_HOME>/ios/<releaseVersion>/runner`, where `MEU_HOME` defaults to `~/.meu`.
It passes this directory to the startup script via `--runner-root`. Missing versions or artifacts fail
immediately; the runtime does not download an artifact or fall back to the repository checkout.

The script builds into a destination-specific directory under `.derived-data/` when no compatible
signed Runner is cached, then runs `testServeInputCommands` until the command is stopped. A cached
Runner is reused when its static inputs, destination, listen port, Xcode version, Team, signature,
and provisioning remain valid.

Physical-device signing is prepared by `to-ios-integrate` using its standalone
`node scripts/prepare-signing.mjs --device <CoreDevice-ID> --app <App-Bundle-ID> --runner <runnerPath>` script.
It requires Node.js, Python 3, Xcode and the downloaded Runner, with no Host/MCP or npm package dependency.
It prefers a saved team, then the selected project's team when backed by a valid local identity,
then Keychain/profile discovery. Ambiguous teams require a user selection via `--team`.
The script builds and verifies the Runner without launching the App or serving XCTest commands.
Only successful verification saves the device configuration under `<MEU_HOME>/ios/signing/devices/`.
Stable team-specific Runner Bundle IDs are reserved under `teams/` even after failed builds.
The device filename is `sha256(hardwareUDID).json` (UTF-8, lowercase hex); its JSON fields are
`teamId` and `bundleId`. This file is the skill/Host contract. The Host never writes it.
No passwords or private keys are stored.

MCP `connect` reads the saved configuration without team discovery or selection. It reuses valid
Runner artifacts and automatically reprovisions expired ones with the same team. Missing configuration
or account/keychain/permission failures route to the signing setup/repair path in `to-ios-integrate`.
Disconnect an active device connection before repairing or changing its signing configuration.
For a USB device, the Host Controller also owns an
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

The target App SDK accepts an identifier, UIPath, UIView, or screen point. All targets
are resolved on the App main thread to screen points, bounds and interface orientation;
the App also computes scroll endpoints. Only the resulting coordinate command reaches
the Runner through `requestController`. Identifier/label paths use the App's native
UIView query. `class::` is unsupported.

The Runner synthesizes touch/text records without querying XCTest elements. See
[`sdk/runners/ios-input`](../../sdk/runners/ios-input/README.md) for event timelines,
deadline handling and supported runtimes.

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
`DEVELOPMENT_TEAM=<TEAM_ID> PRODUCT_BUNDLE_IDENTIFIER=<UNIQUE_RUNNER_BUNDLE_ID> -allowProvisioningUpdates`. Xcode signs the Runner, XCTest bundle, and
embedded Runtime with that Team's development identity and provisioning profile.
