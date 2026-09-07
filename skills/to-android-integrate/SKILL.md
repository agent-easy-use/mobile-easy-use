---
name: to-android-integrate
description: Integrate MobileEasyUse into one existing Android App debug variant with automatic startup. Invoke as $to-android-integrate.
---

# Integrate MobileEasyUse into Android

Complete the integration, report the changes, and ask whether to verify. Verification covers building, installation, launch, connection, and probing.

## Acquire the artifact

Before editing the target project, run `node scripts/ensure-artifacts.mjs`, resolving the script path relative to this `SKILL.md`. The script requires Node.js 20 or newer and works on Windows, macOS, and Linux. It:

- resolves the latest GitHub Release;
- reuses a complete matching artifact in `~/.meu`;
- otherwise downloads the Android Maven archive, verifies it against `SHA256SUMS`, and extracts it;
- prints one JSON object containing `version`, `repositoryPath`, `artifactPath`, and `cacheHit`.

Use `MEU_HOME` when the user or environment needs a cache root other than `~/.meu`. Use `GITHUB_TOKEN` when authenticated GitHub API access is required. Stop and report the script error if acquisition or checksum validation fails. Do not substitute a source-tree build.

## Workflow

1. Acquire the artifact and retain the JSON result.
2. Inspect the Android modules, Gradle files, repositories, build types, and product flavors. Identify the App module and its debuggable variants.
3. Resolve the target variant:
   - Use a variant already named by the user.
   - If exactly one debug variant is available, use it.
   - If multiple debug variants are available, ask the user exactly once to choose from the discovered names, then continue with that selection.
4. Add the returned `repositoryPath` as a project-level Maven repository. Keep the path portable by deriving it from `MEU_HOME`, or from the current user's home plus `.meu`, in the target Gradle settings. Do not commit one user's absolute home path.
5. Use Automatic startup. Scope `com.agenteasyuse:mobile-easy-use:<returned version>` to the selected debuggable variant with `debugImplementation(...)`, or the matching variant-aware configuration such as `internalDebugImplementation(...)`.
6. The AAR manifest provider `com.agenteasyuse.mobileeasyuse.internal.MobileEasyUseInitProvider` calls `MobileEasyUse.initialize()` before `Application.onCreate()`. The variant dependency completes the startup integration.
7. Report the artifact version and cache path, target module, variant, changed files, dependency configuration, and Automatic startup. Ask whether the user wants to verify the integration.

## Manual startup

Use this path when the user explicitly requests Manual startup. In the selected variant's manifest overlay, remove `com.agenteasyuse.mobileeasyuse.internal.MobileEasyUseInitProvider` with `tools:node="remove"`. Then call `MobileEasyUse.initialize()` from that variant's startup path. `MobileEasyUse.isLoaded()` reports whether the initializer loaded the runtime.

When verification is requested initially or confirmed after integration, read [references/validation.md](references/validation.md) completely and follow it.
