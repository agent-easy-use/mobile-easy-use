# mobile-easy-use iOS CocoaPods integration

This integration is for internal test builds only. It embeds the MobileEasyUse bridge and runtime
in the App without linking or loading either image at startup. LLDB attaches first and loads the
lightweight `MobileEasyUse.dylib` bootstrap, which then loads `MobileEasyUseRuntime.dylib` on a
background thread while LLDB remains attached.

## Add the Pod

First inspect the App's existing build configurations. Use the user-named configuration, the only
discovered debug configuration, or the exact configuration selected by the user when several are
available. The example below calls that selection `InternalDebug`; do not assume every project uses
the literal name `Debug`.

```ruby
selected_internal_configuration = 'InternalDebug'

project 'MyApp.xcodeproj',
  selected_internal_configuration => :debug,
  'Release' => :release

target 'MyApp' do
  pod 'MobileEasyUse',
      :configurations => [selected_internal_configuration]

  script_phase(
    :name => '[MobileEasyUse] Embed Runtime',
    :script => %Q{"${PODS_ROOT}/MobileEasyUse/integration/ios/Scripts/embed-mobile-easy-use.sh" --configuration "#{selected_internal_configuration}"},
    :input_files => [
      '${PODS_ROOT}/MobileEasyUse/integration/ios/Scripts/embed-mobile-easy-use.sh',
      '${PODS_ROOT}/MobileEasyUse/integration/ios/Binaries/${PLATFORM_NAME}/MobileEasyUse.dylib',
      '${PODS_ROOT}/MobileEasyUse/integration/ios/Binaries/${PLATFORM_NAME}/MobileEasyUseRuntime.dylib',
      '${PODS_ROOT}/MobileEasyUse/integration/ios/MobileEasyUseRuntime.config'
    ],
    :output_files => [
      '${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/MobileEasyUse.dylib',
      '${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/MobileEasyUseRuntime.dylib',
      '${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/MobileEasyUseRuntime.config'
    ],
    :execution_position => :after_compile
  )
end
```

The Pod contains no App-linked source or vendored-library declaration. The `:configurations`
constraint remains required so the embed hook cannot put either dylib in a production App. Never declare this Pod without an explicit internal configuration.

The Pod follows the project's existing dependency-version strategy. `Podfile.lock` records the
resolved version. Add an explicit version constraint when the project requires one.

For local development, use the repository path:

```ruby
pod 'MobileEasyUse',
    :path => '/path/to/mobile-easy-use',
    :configurations => [selected_internal_configuration]
```

Run `pod install` and open the generated workspace.

## Runtime build hook

The Podfile `script_phase` installs the Embed Runtime build hook and declares all of its inputs and
outputs. Xcode's User Script Sandboxing can remain enabled. The Podfile passes the exact selected
configuration through `--configuration <name>`; the hook exits without changes for every other
configuration. For the selected configuration it chooses the device or simulator runtime,
copies both dylibs to the App's `Frameworks` directory, installs
`MobileEasyUseRuntime.config`, and signs both dylibs with the App's current signing identity.

`MobileEasyUse.dylib` contains the Objective-C bridge and Runtime bootstrap, but has no load command
for `MobileEasyUseRuntime.dylib`. The App executable contains neither bridge symbols nor a startup
dependency on either image.

The debugger-only load boundary is provided by the App not linking either image and by the LLDB
loader checking image absence before loading the bootstrap in the attached process. The bootstrap
constructor calls `mobile_easy_use_load_runtime_async`, which rejects the request unless `P_TRACED`
confirms that a debugger is attached. LLDB keeps its default single-thread execution policy while
`SBProcess.LoadImage` runs, then continues the process so the bootstrap worker can load Runtime. The
Loader remains attached until the bootstrap reports completion. It normally reads the exported
`mobile_easy_use_runtime_bootstrap_status` memory block after validating its magic value. The
existing `mobile_easy_use_runtime_bootstrap_state` and
`mobile_easy_use_runtime_bootstrap_error` functions remain available as a fallback when that block
is missing, unreadable, or has an unexpected magic value.

When the native bridge sources change, rebuild both platform bridge binaries from the repository
root before publishing:

```bash
integration/ios/Scripts/build-mobile-easy-use.sh
```

The script matches each committed Frida runtime's architecture slices, verifies that the bridge has no
direct runtime dependency, and applies an ad-hoc repository signature. The App embed hook replaces that signature
with the selected build's signing identity.

## Load after LLDB attaches

Build the App. You may launch it through its normal path before running the command; otherwise the command launches it:

```bash
# Physical device
mobile-easy-use-ios load \
  --device "My iPhone" \
  --bundle-id "com.example.MyApp"

# Booted simulator
mobile-easy-use-ios load \
  --simulator "iPhone 17" \
  --bundle-id "com.example.MyApp"
```

The command resolves CoreDevice and hardware identifiers separately, resolves or launches the App
through a direct `devicectl` invocation with file-backed JSON and diagnostic output, then keeps a scoped
CoreDevice console session alive while LLDB runs. On a physical device, it verifies that the same PID
still identifies the same executable before attaching LLDB. Device
discovery, selection, process attach, and the Python loader all
execute in the same LLDB process. The loader waits for `SBProcess` to report the stopped state and
derives the remote App Frameworks path. When both images already exist exactly once it detaches and
reports them immediately. When both are absent, it uses `SBProcess.LoadImage` only for the lightweight
bridge; its constructor schedules the asynchronous Runtime trigger, and the Loader continues the App.
The bootstrap loads Runtime on its worker thread and records whether it reached `loaded` or `failed`.
The Loader briefly interrupts the process while polling that state; unrelated App stops encountered
while the bootstrap is `loading` are continued. This uses the first and only LLDB
attachment and does not run Runtime initialization inside an LLDB expression.
Any invalid or duplicate image state fails. It then verifies both images appear exactly once and
detaches with `SBProcess.Detach`. It does not parse LLDB prompts or terminal output.
A successful command prints `loadState` as `loaded` or `already-loaded`, both image identities, and a
`detachState` of `detached`. For either target type, the
bundle ID resolves the App PID without terminating an existing process; an App that is not already
running is launched. The physical-device Loader verifies the newly resolved process immediately before
LLDB attaches; subsequent Probe operations reuse the loaded runtime and do not rerun the Loader.
On a physical device, the CoreDevice launch resolution is bounded by `--timeout`
and a transient timeout is retried up to three times. The scoped console session holds CoreDevice's
usage assertion until LLDB detaches, so `device list` and `device select` see the same connected
device without requiring Xcode or restarting host services. Deterministic device errors still fail
immediately; LLDB attach and runtime loading are never automatically retried.

Simulator loading uses CoreSimulator rather than CoreDevice. The command requires an already booted
simulator, resolves or launches the bundle with `simctl` to obtain its PID, and performs a local LLDB PID attach.
After loading, connect directly to `127.0.0.1:8484`; simulators do not require USB port forwarding.

For a physical device, keep `iproxy -u "<device-udid>" 28484:8484` running and connect the MCP to
`127.0.0.1:28484`. Port 28484 is the fixed iOS host-side mapping; the device runtime remains on 8484.

After MCP `connect` validates the target App runtime, the connection starts `MEUStandaloneRunner`
and opens its second Frida Session automatically. On a physical device, set
`MOBILE_EASY_USE_IOS_DEVELOPMENT_TEAM=<team-id>` before starting the Host; it also owns the Runner's
dynamically reserved Host-port forwarding to device port `8485`. Do not start or forward the Runner
manually.

The MobileEasyUse runtime listens on `0.0.0.0:8484`, uses QuickJS, and resumes without waiting for a client. A physical
device needs host-to-device port forwarding before connecting from the MCP.

> **Security:** `0.0.0.0` exposes the runtime on every device network interface. Only enable this Pod
> in a trusted, debuggable internal configuration. Never include it in Release, TestFlight, or App
> Store builds.

## Log evidence contract

Action-scoped iOS log evidence observes `NSLog` only. The format may start with a literal `[TAG] `
prefix or the supported dynamic `[%@]` TAG form:

```swift
NSLog("[Network] request failed: %@", error.localizedDescription) // captured for Network
NSLog("[%@] request failed", "Network")                          // captured for Network
```

TAG matching is exact and case-sensitive. Dynamic capture requires the first variadic argument to be
an `NSString` equal to the requested TAG; other dynamic format shapes are ignored. The replacement
preserves the original `NSLog` format, arguments, and system output. Evidence retains both its
separate `tag` field and the rendered leading `[TAG]` text in `message`. `print`, `os_log`, and Swift
`Logger` are outside this contract.

## Embedded native runtime

The committed physical-device runtime is based on Frida `17.16.4` (`arm64`, `arm64e`). The iOS
Simulator runtime is intentionally pinned to Frida `17.9.11` (`arm64`, `x86_64`), the last release
before the upstream unwind-broker change that crashes standalone Gadget initialization on iOS 26
([frida/frida#3765](https://github.com/frida/frida/issues/3765)). Its committed SHA-256 is
`1655a0cdd0b2e84cbd8a5eb5cf20916af854212d495d1d3ce69e0050abad67c5` after applying the
`@loader_path/MobileEasyUseRuntime.dylib` install name and ad-hoc repository signature.

The bridge and runtime are stored as separate dylibs because the bridge is owned by MobileEasyUse
while the runtime remains the pinned Frida Gadget binary. Keep the simulator pin until upstream ships and this
repository verifies a release that resolves the iOS 26 standalone-Gadget regression.
