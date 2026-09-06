# mobile-easy-use Android AAR

This Gradle project builds the target-App integration library for mobile-easy-use. It is separate
from `sdk/android`, which is the JavaScript runtime loaded by the MCP after connecting to the
MobileEasyUse runtime.

## Build and publish locally

The four Android ABI MobileEasyUse runtime binaries are committed under the library's
`src/main/jniLibs` tree, so
the build is deterministic and does not download native artifacts.

```bash
./gradlew :mobile-easy-use:assembleRelease
./gradlew :mobile-easy-use:publishReleasePublicationToLocalRepository
```

The AAR is written to:

```text
mobile-easy-use/build/outputs/aar/mobile-easy-use-release.aar
```

The project-level local Maven repository is written to
`build/maven-repository`, relative to the `integration/android` Gradle root.

## Consume from an App debug variant

Publish the AAR to the intended Maven repository, then add it to the existing debug variant:

```kotlin
dependencies {
    debugImplementation("com.agenteasyuse:mobile-easy-use:0.1.0")
}
```

For another debuggable internal variant, use its matching dependency configuration, such as
`internalDebugImplementation`. The AAR contains all supported native ABIs; the App variant's
`abiFilters` determines which ABI is packaged into the final APK.

The AAR automatically loads the MobileEasyUse runtime in the App's default process before
`Application.onCreate()`. The runtime listens on `0.0.0.0:8484`, uses QuickJS, and does not block
App startup while waiting for a client.

To start it manually, remove the provider from that variant's manifest overlay and initialize it
from that variant's code path:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <application>
        <provider
            android:name="com.agenteasyuse.mobileeasyuse.internal.MobileEasyUseInitProvider"
            tools:node="remove" />
    </application>
</manifest>
```

```kotlin
MobileEasyUse.initialize()
```

> **Security:** `0.0.0.0` exposes the runtime on every device network interface. This AAR must only be
> included only in a trusted, debuggable internal APK. Never add it to a production or store build.

For an ADB-connected device, forward the port and connect the MCP to the host-side endpoint:

```bash
adb forward tcp:18484 tcp:8484
```

Then connect the MCP to `127.0.0.1:18484`. The App-side runtime continues to listen on port 8484.

## Embedded native runtime

The committed MobileEasyUse runtime binaries are based on Frida `17.16.4` for `armeabi-v7a`,
`arm64-v8a`, `x86`, and `x86_64`. Their adjacent `libmobile_easy_use.config.so` files are UTF-8
runtime JSON configs, not ELF shared libraries.
