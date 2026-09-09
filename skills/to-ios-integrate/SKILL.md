---
name: to-ios-integrate
description: Integrate MobileEasyUse into an iOS App debug configuration, or prepare and repair physical-device Runner signing.
---

# Integrate MobileEasyUse into iOS

## Acquire the artifacts

Before editing the target project, run `node scripts/ensure-artifacts.mjs`, resolving the script path relative to this `SKILL.md`. The script requires Node.js 20 or newer and downloads on Windows, macOS, and Linux. It fetches the live compatibility catalog, verifies `SHA256SUMS`, and installs both archives under `~/.meu/ios/<version>`:

- `integration` contains the App integration binaries and scripts;
- `runner` contains the XCTest runner and runtime used by MobileEasyUse.

If the JSON result contains `actionRequired: "confirm-update"`, report the cached and latest Release versions and ask whether to update. Run the script again with `--update` when accepted or `--use-cached` when declined. Preserve a Release already pinned by the project unless the user accepts an upgrade; select it with `--version <version>`. A normal result contains `releaseVersion`, `integrationPath`, `runnerPath`, `minimumMcpVersion`, `maximumMcpVersion`, and an exact `mcpCommand`.

Use `MEU_HOME` to override `~/.meu`. Artifacts and checksums are downloaded directly from the public GitHub Release; no GitHub token or login is required. The selected Release's catalog range defines MCP compatibility. Stop and report acquisition, catalog, or checksum errors.

Artifact acquisition is cross-platform. Xcode project changes, building, signing, and runtime verification require macOS; on Windows or Linux, finish the download, report both cache paths, and explain that the integration phase must continue on macOS.

## Workflow

1. Inspect the project for an existing `MEU_VERSION`. Acquire that exact version with `--version` when present; otherwise use the default selection flow above. Retain the JSON result.
2. Inspect the workspace/project, App target, schemes, build configurations, and Podfile. Use the internal configuration named by the user. If one debug configuration exists, select it. If several exist, ask once for the selection.
3. Select `Binaries/iphoneos` for a device build or `Binaries/iphonesimulator` for a simulator build.
4. Produce this layout in the selected App:

   ```text
   <App>.app/Frameworks/MobileEasyUse.dylib
   <App>.app/Frameworks/MobileEasyUseRuntime.dylib
   <App>.app/MobileEasyUseRuntime.config
   ```

5. Keep both dylib filenames unchanged. After copying and any Mach-O changes, sign both dylibs with the App build's signing identity. For an already signed App or IPA, sign the dylibs first and then sign the App.
6. Scope the copy and signing operation to the selected internal configuration.

Use the Xcode or CocoaPods procedure below to implement these steps.

## Xcode

Use the returned `integrationPath`. Configure a user-defined Xcode build setting named `MEU_HOME` as `$(HOME)/.meu`, unless the environment uses an explicit cache root, and `MEU_VERSION` as the returned version. Add an after-compile Run Script phase to the App target:

```bash
"${MEU_HOME}/ios/${MEU_VERSION}/integration/Scripts/embed-mobile-easy-use.sh" \
  --configuration "<SelectedInternalConfiguration>"
```

Declare these inputs:

```text
${MEU_HOME}/ios/${MEU_VERSION}/integration/Scripts/embed-mobile-easy-use.sh
${MEU_HOME}/ios/${MEU_VERSION}/integration/Binaries/${PLATFORM_NAME}/MobileEasyUse.dylib
${MEU_HOME}/ios/${MEU_VERSION}/integration/Binaries/${PLATFORM_NAME}/MobileEasyUseRuntime.dylib
${MEU_HOME}/ios/${MEU_VERSION}/integration/MobileEasyUseRuntime.config
```

Declare these outputs:

```text
${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/MobileEasyUse.dylib
${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/MobileEasyUseRuntime.dylib
${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/MobileEasyUseRuntime.config
```

The Run Script phase is the App target integration. It selects the platform binaries, copies the three artifacts, and signs both dylibs.

## CocoaPods

CocoaPods adds the embed script phase to the App target. `ensure-artifacts.mjs` supplies the selected Release in the cache, and the phase consumes that Release at build time.

Configure `MEU_HOME` and `MEU_VERSION` on the selected App target as described in the Xcode procedure. Keep both values as portable build settings:

```ruby
mobile_easy_use_ios = '${MEU_HOME}/ios/${MEU_VERSION}/integration'
```

Scope the script phase to the selected configuration:

```ruby
selected_internal_configuration = 'InternalDebug'

target 'MyApp' do
  script_phase(
    :name => '[MobileEasyUse] Embed Runtime',
    :script => %Q{"#{mobile_easy_use_ios}/Scripts/embed-mobile-easy-use.sh" --configuration "#{selected_internal_configuration}"},
    :input_files => [
      "#{mobile_easy_use_ios}/Scripts/embed-mobile-easy-use.sh",
      "#{mobile_easy_use_ios}/Binaries/${PLATFORM_NAME}/MobileEasyUse.dylib",
      "#{mobile_easy_use_ios}/Binaries/${PLATFORM_NAME}/MobileEasyUseRuntime.dylib",
      "#{mobile_easy_use_ios}/MobileEasyUseRuntime.config"
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

Map a custom configuration to `:debug` in the Podfile `project` declaration when required, then run `pod install`. The generated phase reads `${MEU_HOME}/ios/${MEU_VERSION}/integration` at build time.

## Runner signing

MobileEasyUse uses a separate XCTest Runner for iOS input actions. On physical devices, the Runner needs development signing and a provisioning profile covering the device so iOS can install and run it.

For physical devices, follow [Setup](references/signing.md#setup) to prepare Runner signing.
For Runner signing errors reported by the Host, follow [Repair](references/signing.md#repair).
These steps can run independently of App integration. Simulators do not require this setup.
If no physical device is available, report Runner signing as pending.

## Finish

Report the Release version, integration and runner cache paths, compatible MCP range, exact version-pinned MCP command, App target, selected configuration, integration method, changed files, embed command, and signing result (verified team, pending, or not applicable). For requested App/runtime verification, read [references/validation.md](references/validation.md) completely and follow it.
