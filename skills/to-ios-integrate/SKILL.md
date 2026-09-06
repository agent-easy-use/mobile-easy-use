---
name: to-ios-integrate
description: Integrate MobileEasyUse into one existing iOS App debug configuration through basic Xcode operations or CocoaPods. Invoke as $to-ios-integrate.
---

# Integrate MobileEasyUse into iOS

## Workflow

1. Inspect the workspace/project, App target, schemes, build configurations, and Podfile. Use the internal configuration named by the user. If one debug configuration exists, select it. If several exist, ask once for the selection.
2. Select `Binaries/iphoneos` for a device build or `Binaries/iphonesimulator` for a simulator build.
3. Produce this layout in the selected App:

   ```text
   <App>.app/Frameworks/MobileEasyUse.dylib
   <App>.app/Frameworks/MobileEasyUseRuntime.dylib
   <App>.app/MobileEasyUseRuntime.config
   ```

4. Keep both dylib filenames unchanged. After copying and any Mach-O changes, sign both dylibs with the App build's signing identity. For an already signed App or IPA, sign the dylibs first and then sign the App.
5. Scope the copy and signing operation to the selected internal configuration.

Use the Xcode or CocoaPods procedure below to implement these steps.

## Xcode

Place the published `integration/ios` directory at a stable project-relative path. Add an after-compile Run Script phase to the App target:

```bash
<IntegrationRoot>/Scripts/embed-mobile-easy-use.sh \
  --configuration "<SelectedInternalConfiguration>"
```

Declare these inputs:

```text
<IntegrationRoot>/Scripts/embed-mobile-easy-use.sh
<IntegrationRoot>/Binaries/${PLATFORM_NAME}/MobileEasyUse.dylib
<IntegrationRoot>/Binaries/${PLATFORM_NAME}/MobileEasyUseRuntime.dylib
<IntegrationRoot>/MobileEasyUseRuntime.config
```

Declare these outputs:

```text
${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/MobileEasyUse.dylib
${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/MobileEasyUseRuntime.dylib
${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/MobileEasyUseRuntime.config
```

The Run Script phase is the App target integration. It selects the platform binaries, copies the three artifacts, and signs both dylibs.

## CocoaPods

Choose the MobileEasyUse integration directory for the selected Pod source:

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

## Finish

Report the App target, selected configuration, integration method, changed files, and embed command. When verification is requested, read [references/validation.md](references/validation.md) completely and follow it.
