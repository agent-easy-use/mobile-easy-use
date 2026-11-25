---
name: to-android-presets
description: Generate reusable Android App scene driving, inspection, and temporary overrides for Test and Probe in the configured presets directory, build the bundle, and verify on-device when a device is available.
---

# To Android Presets

Build reusable App-specific capabilities for Test and Probe using drive, inspect, override and direct Frida. Callers compose these capabilities and own test registration and assertions. Keep presets focused on App knowledge rather than recreating SDK wrappers.

## Generation rules

Call `get_sdk_declarations({"platform":"android"})` and read the required SDK, bridge, and Gum
contracts. Reuse only the relevant rules from the probe-script references:

- [drive](../to-android-probe-script/references/drive.md): reach a known scene and wait for its completion.
- [inspect](../to-android-probe-script/references/inspect.md): observe UI, logs, methods or code locations using App-specific targets.
- [override](../to-android-probe-script/references/override.md): establish dependency conditions that help reach a scene.
- [direct Frida](../to-android-probe-script/references/direct-frida.md): execute App functions, resolve objects and read native state.

Use SDK globals and respect platform thread/value contracts. Do not install hooks, start watchers or drive the App at module load.

## Return values and cleanup

A preset imported through /meu/presets.js runs in the same Frida runtime as its caller. It may return ordinary observations, native objects, a watcher or an async remove closure when that is its documented purpose. The caller's final return to Host/Agent is serialized: prefer extracting JSON-compatible business values from native objects, and do not return watcher/removal handles across RPC. Ordinary objects do not need manual stringify.

Choose a clear lifetime for each capability:

- A bounded scenario owns resources it creates and cleans them in finally before settling.
- An installer returns the SDK watcher or remove closure and documents that the caller must await stop/remove after dependent operations. Do not create another scope, registry or action abstraction.

An override installer can simply return await override.method(definition, replacement); the caller keeps it active while driving and inspecting. Cleanup must cover partial setup and preserve primary and cleanup failures. Removal ends future overrides; it does not undo business effects. UI reads return directly; log/method/code watchers use asynchronous watch/current/stop.

## Directory

1. **Location:** Read `presets.directory` from `<project-root>/.meu/config.json` and append
   `android`. Relative paths resolve from the target project root, also used as the MCP
   working directory. Always use the saved config to locate presets.
2. **Initialization:** If the config file or `presets.directory` is missing, save the user's
   explicit base directory, or `.meu/presets` when unspecified. Preserve unrelated config fields.
3. **Switching:** Keep the configured base unless the user explicitly requests a different one;
   compare resolved paths. If either platform's `presets.dist.js` exists under the old base,
   explain that its capabilities will no longer load through the new base and obtain explicit
   confirmation before updating config. Otherwise update directly. If declined, keep the old
   config. Preserve unrelated fields and retain old files.

## Source contract

```text
<base-directory>/android/
├── page-state/
│   ├── index.js
│   └── index.d.ts
├── network-request/
│   ├── index.js
│   └── index.d.ts
├── presets.entry.js
└── presets.dist.js
```

Use one feature directory per coherent capability. `presets.entry.js` explicitly re-exports
public functions from `./<feature>/index.js`; each feature's `index.d.ts` describes its exports.

Keep declarations accurate, including async signatures, return values, preconditions, state effects, and who owns cleanup.
Run App actions only inside functions and stop on failure.

Read the entry, feature declarations and relevant sources before generating equivalents.
Never edit `presets.dist.js`.

## Workflow

1. Resolve identifiers from App source and generate/update `<feature>/index.js` and `index.d.ts`.
   Reuse existing declarations and local source modules through relative imports inside the
   platform presets directory. Do not import `/meu/presets.js` into its own source bundle.
2. This skill creates and maintains `presets.entry.js`: create it on first use, then add, remove
   or update explicit exports for the current feature changes while preserving other existing
   exports. Export only the intended public capabilities; do not put business logic in this file.
3. From the project root, run the build script. It only reads config and bundles the existing
   entry into `presets.dist.js`; a failed build retains the previous artifact.

   ```bash
   node <skill-directory>/scripts/build-presets.mjs
   ```

4. If a target device is available, follow [to-android-run](../to-android-run/SKILL.md), connect the App and actually
   execute the changed capabilities via `/meu/presets.js` imports. Disconnect/reconnect an existing
   session first to load the new bundle, after stopping/removing caller-owned resources and finishing active work. Verify changed capabilities with a separate script;
   fix failures and rebuild.
   Do not retry a timed-out mutation without restoring a known starting state.
5. Report generated capabilities and build/verification results. Without a device, complete
   generation and bundling, explicitly state that actual runtime behavior remains unverified,
   and identify the remaining device or simulator verification needed. Never treat build success or a
   failed device run as verification.
