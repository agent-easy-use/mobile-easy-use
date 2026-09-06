---
name: to-android-presets
description: Build reusable Android presets for a target App scene by reading project source, then iterating with to-android-script and to-android-run until each driver action and probe is verified. Use when creating or extending docs/mobile-easy-use preset source, declarations, and exports for a reproducible scene workflow.
---

# To Android Presets

Build the smallest reusable preset for one target scene. Discover identifiers from source and
verify each capability on-device before promoting it into `docs/mobile-easy-use`.

## Workflow

1. Read the complete sibling `../to-android-script/SKILL.md` and
   `../to-android-run/SKILL.md`; follow both contracts throughout this workflow.
2. Inspect the target App source to resolve the scene entry, UI hierarchy, resource IDs,
   business symbols, transitions, and expected state. Never guess identifiers.
3. Inspect `docs/mobile-easy-use/presets.d.ts`, `presets.entry.js`, and relevant source modules.
   Reuse existing capabilities and do not read or edit the generated `presets.js` directly.
4. Split the scene into the smallest ordered capabilities. Establish the driver path first, then
   add only the probes needed to observe the requested behavior.
5. For one capability at a time:
   - use `to-android-script` to generate or revise a temporary `probe.js` and `probe.d.ts`;
   - use `to-android-run` to execute exactly one exported function;
   - compare the result and evidence with the expected scene state;
   - revise only the failing capability, then verify it again from a known start state.
6. Promote only verified, reusable logic into a focused module under `docs/mobile-easy-use/`.
   Keep driver exports action-oriented and probe exports evidence-oriented. Add matching JSDoc
   declarations and re-export public capabilities from `presets.entry.js` and `presets.d.ts`.
7. Run the presets build and relevant checks. Confirm generated scripts can import public presets
   only from `/docs/mobile-easy-use/presets.js` and only through declarations in `presets.d.ts`.

## Iteration rules

- Keep every iteration independently understandable and executable.
- Do not promote an unverified action, selector, hook, state accessor, or return contract.
- Do not automatically retry a failed or timed-out mutating call; restore a known scene first.
- Preserve the smallest stable public API and avoid scenario-specific duplication.
- Report verified capabilities, remaining gaps, and any SDK limitation separately.
