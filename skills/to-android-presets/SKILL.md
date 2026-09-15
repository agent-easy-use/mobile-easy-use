---
name: to-android-presets
description: Generate reusable Android App actions, state access, and scoped overrides for Test and Probe in the configured presets directory, build the bundle, and verify on-device when a device is available.
---

# To Android Presets

Build reusable App capabilities for Test and Probe. Presets provide actions, state access,
and scoped condition setup; callers own evidence collection, test registration, and assertions.

## Generation rules

Call `get_sdk_declarations({"platform":"android"})` and read the required SDK, bridge, and Gum
contracts. Reuse only the relevant rules from the probe-script references:

- [Driver](../to-android-probe-script/references/driver-generation.md): navigation, UI interactions, and business flows.
- [Override](../to-android-probe-script/references/override-generation.md): return definitions for callers to scope, or accept an action and return/await `Override.run`. Restore changes when the action settles.
- [Direct Frida](../to-android-probe-script/references/direct-frida-generation.md): native state reads, internal calls, and condition setup.

Follow platform thread and lifetime contracts. Use this skill's source contract and workflow.

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

Keep declarations accurate, including preconditions, state effects, and cleanup.
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
   session first to load the new bundle. Verify changed capabilities with a separate script;
   fix failures and rebuild.
   Do not retry a timed-out mutation without restoring a known starting state.
5. Report generated capabilities and build/verification results. Without a device, complete
   generation and bundling, explicitly state that actual runtime behavior remains unverified,
   and recommend connecting a physical device to verify it. Never treat build success or a
   failed device run as verification.
