# Runner signing

Use for initial setup or repair without repeating App integration. Require macOS, Node.js 20+, Python 3, Xcode, and an available physical device. Acquire missing artifacts using `scripts/ensure-artifacts.mjs` relative to the skill directory; retain `runnerPath`. Disconnect any active MCP connection for this device first.

## Setup

Run the skill script (paths relative to this skill’s directory):

```bash
node scripts/prepare-signing.mjs --device '<CoreDevice-ID>' --app '<App-Bundle-ID>' \
  --runner '<runnerPath>'
```

When available, append `--project-team '<Team-ID>'` from the selected App target's effective `DEVELOPMENT_TEAM`: inspect `xcodebuild -showBuildSettings -json` for the selected workspace/project, scheme, configuration, and physical-device destination. The helper resolves the hardware UDID itself; no Host/MCP installation is needed.

Selection order: saved device configuration → project team with a valid local development identity → Keychain/profile discovery. For `IOS_SIGNING_TEAM_REQUIRED`, show the returned team names and IDs, obtain a selection, and rerun with `--team '<Team-ID>'`. This explicit selection overrides saved configuration and permits Xcode to provision missing signing assets.

The command builds or reuses the Runner and verifies its signature, team, profile expiry, and device inclusion without launching the App. Only success (`verified: true`) saves configuration under `<MEU_HOME>/ios/signing/devices/` (`MEU_HOME` defaults to `~/.meu`). Failed attempts preserve the previous choice and reserved Runner Bundle IDs.

## Repair

Use the returned error and build output. Explain signing teams by their available names (person or organization); use Team IDs only to disambiguate, and do not infer an Apple Account email from a certificate name.

- `IOS_SIGNING_SETUP_REQUIRED`: for missing configuration, follow Setup. For login failures, ask the user to sign in or refresh their iOS development Apple Account in Xcode → Settings → Apple Accounts, then rerun. If the previous team is unavailable, show named candidates for reselection.
- `IOS_SIGNING_KEYCHAIN_ERROR`: restore Keychain/private-key access for codesign.
- `IOS_SIGNING_PROVISIONING_FAILED`: resolve the reported certificate, device registration, App ID, or team permission failure.
- `IOS_SIGNING_CONFIG_ERROR`: inspect and correct the reported configuration file.

Keep the saved team and rerun after resolving the cause. If that team is no longer usable, obtain a replacement selection and pass `--team`. Stop and report prerequisites requiring user action; do not retry unchanged failures.

`connect` consumes the saved configuration and attempts to rebuild and sign an invalid cached Runner with the same team; expiry alone does not require reselection. Report Runner signing verification separately from App/runtime verification.
