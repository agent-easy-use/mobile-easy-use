---
name: to-android-integrate
description: Integrate MobileEasyUse into one existing Android App debug variant with automatic startup. Invoke as $to-android-integrate.
---

# Integrate MobileEasyUse into Android

Complete the integration, report the changes, and ask whether to verify. Verification covers building, installation, launch, connection, and probing.

## Workflow

1. Inspect the Android modules, Gradle files, repositories, build types, and product flavors. Identify the App module and its debuggable variants.
2. Resolve the target variant:
   - Use a variant already named by the user.
   - If exactly one debug variant is available, use it.
   - If multiple debug variants are available, ask the user exactly once to choose from the discovered names, then continue with that selection.
3. Use Automatic startup. Scope `com.agenteasyuse:mobile-easy-use:0.1.0` to the selected debuggable variant with `debugImplementation(...)`, or the matching variant-aware configuration such as `internalDebugImplementation(...)`.
4. The AAR manifest provider `com.agenteasyuse.mobileeasyuse.internal.MobileEasyUseInitProvider` calls `MobileEasyUse.initialize()` before `Application.onCreate()`. The variant dependency completes the startup integration.
5. Reuse a configured Maven repository that contains the artifact. For a local MobileEasyUse checkout, run `./gradlew :mobile-easy-use:publishReleasePublicationToLocalRepository` from `integration/android`, then add the project-level repository at `integration/android/build/maven-repository` (or the equivalent path from the target project).
6. Report the target module, variant, changed files, dependency configuration, and Automatic startup. Ask whether the user wants to verify the integration.

## Manual startup

Use this path when the user explicitly requests Manual startup. In the selected variant's manifest overlay, remove `com.agenteasyuse.mobileeasyuse.internal.MobileEasyUseInitProvider` with `tools:node="remove"`. Then call `MobileEasyUse.initialize()` from that variant's startup path. `MobileEasyUse.isLoaded()` reports whether the initializer loaded the runtime.

When verification is requested initially or confirmed after integration, read [references/validation.md](references/validation.md) completely and follow it.
