---
name: to-ios-presets
description: Generate reusable iOS App probes and declarations in the configured presets directory, build the bundle, and verify on-device when a device is available.
---

# To iOS Presets

Generate reusable probe code and declarations for the user's request. Use
[to-ios-script](../to-ios-script/SKILL.md) for generation, and
[to-ios-run](../to-ios-run/SKILL.md) for verification when a device is available.

## Directory

1. **Location:** Read `presets.directory` from `<project-root>/.meu/config.json` and append
   `ios`. Relative paths resolve from the target project root, also used as the MCP
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
<base-directory>/ios/
├── page-state/
│   ├── probe.js
│   └── probe.d.ts
├── network-request/
│   ├── probe.js
│   └── probe.d.ts
├── presets.entry.js
└── presets.dist.js
```

Use one feature directory per coherent capability. `presets.entry.js` explicitly re-exports
public functions from `./<feature>/probe.js`; each feature's `probe.d.ts` describes its exports.
Keep feature declarations consistent with their implementations.

Read the entry, feature declarations and relevant sources before generating equivalents.
Never edit `presets.dist.js`.

## Workflow

1. Resolve identifiers from App source and generate/update `<feature>/probe.js` and `probe.d.ts`.
   Tell to-script to skip presets declaration lookup and `/meu/presets.js` imports for this source
   generation; reuse local source modules through relative imports.
2. This skill creates and maintains `presets.entry.js`: create it on first use, then add, remove
   or update explicit exports for the current feature changes while preserving other existing
   exports. Export only the intended public capabilities; do not put business logic in this file.
3. From the project root, run the build script. It only reads config and bundles the existing
   entry into `presets.dist.js`; a failed build retains the previous artifact.

   ```bash
   node <skill-directory>/scripts/build-presets.mjs
   ```

4. If a target device is available, read the platform run skill, connect the App and actually
   execute the changed capabilities via `/meu/presets.js` imports. Disconnect/reconnect an existing
   session first to load the new bundle. Check the expected results; fix failures and rebuild.
   Do not retry a timed-out mutation without restoring a known starting state.
5. Report generated capabilities and build/verification results. Without a device, complete
   generation and bundling, explicitly state that actual runtime behavior remains unverified,
   and recommend connecting a physical device to verify it. Never treat build success or a
   failed device run as verification.
