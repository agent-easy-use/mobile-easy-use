---
name: to-ios-integrate
description: Integrate MobileEasyUse into an iOS App debug configuration, or prepare and repair physical-device Runner signing. Invoke as $to-ios-integrate.
---

# Integrate MobileEasyUse into iOS

## Acquire the artifacts

Before editing the target project, run `node scripts/ensure-artifacts.mjs`, resolving the script path relative to this `SKILL.md`. The script requires Node.js 20 or newer and downloads on Windows, macOS, and Linux. It resolves the latest GitHub Release, verifies `SHA256SUMS`, and installs both archives under `~/.meu/ios/<version>`:

- `integration` contains the App integration binaries and scripts;
- `runner` contains the XCTest runner and runtime used by MobileEasyUse.

The script prints one JSON object containing `version`, `integrationPath`, `runnerPath`, and `cacheHit`. Use `MEU_HOME` to override `~/.meu` and `GITHUB_TOKEN` when authenticated GitHub API access is required. Stop and report the script error if acquisition or checksum validation fails.

Artifact acquisition is cross-platform. Xcode project changes, building, signing, and runtime verification require macOS; on Windows or Linux, finish the download, report both cache paths, and explain that the integration phase must continue on macOS.

## Workflow

1. Acquire the artifacts and retain the JSON result.
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

The release cache is the default integration source. Use CocoaPods only when the user already has a published Pod source or a compatible local checkout. Choose that integration directory for the selected Pod source:

```ruby
# Published Pod
mobile_easy_use_ios = '${PODS_ROOT}/MobileEasyUse/integration/ios'

# or
# Local checkout example
mobile_easy_use_ios = '${PODS_PODFILE_DIR_PATH}/relative/path/to/mobile-easy-use/integration/ios'
```

Scope the Pod and script phase to the selected configuration:

```ruby
selected_internal_configuration = 'InternalDebug'

target 'MyApp' do
  pod 'MobileEasyUse',
      :configurations => [selected_internal_configuration]

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

For a local checkout, add its `:path` to the Pod declaration. Follow the project's version policy for a published Pod. Map a custom configuration to `:debug` in the Podfile `project` declaration when required, then run `pod install`.

## Runner signing

MobileEasyUse uses a separate XCTest Runner for iOS input actions. On physical devices, the Runner needs development signing and a provisioning profile covering the device so iOS can install and run it.

For physical devices, follow [Setup](references/signing.md#setup) to prepare Runner signing.
For Runner signing errors reported by the Host, follow [Repair](references/signing.md#repair).
These steps can run independently of App integration. Simulators do not require this setup.
If no physical device is available, report Runner signing as pending.

## Finish

Report the artifact version, integration and runner cache paths, App target, selected configuration, integration method, changed files, embed command, and signing result (verified team, pending, or not applicable). For requested App/runtime verification, read [references/validation.md](references/validation.md) completely and follow it.
