# Distribution compatibility

`compatibility.json` is the public catalog consumed by MCP and integration skills. It describes published, validated combinations only. npm carries Host code, SDK bundles and declarations; the integration Release carries native App libraries and the iOS Runner distribution.

- A Release entry uses an inclusive MCP version range. Expand it only after compatibility validation, not automatically after every npm publication.
- Native ABI changes require a new integration version. Do not overwrite old Release assets or reuse an old version for different native capabilities.
- Retain old entries for existing installations. A new incompatible SDK must not extend an old Runtime's supported range.
- Keep integration/VERSION, GitHub tag and artifact filenames aligned. Package and integration versions are independent, though 0.2.0 intentionally aligns both.
- Publish and verify all artifacts before exposing their combination in compatibility.json.

## Preparing 0.2.0

The local compatibility.json update preserves Runtime 0.1.0 / MCP 0.1.0–0.1.3 and adds Runtime 0.2.0 / MCP 0.2.0 only. Merge this update into the public master branch only after validation and artifact publication complete.

Breaking changes include the drive/inspect/override API, explicit watcher/removal lifecycle, and MCP result/error responses without evidence manifests. Native changes include Android JVMTI debugging and iOS log subscription/screenshot interfaces. Existing App installations need the new integration and an App rebuild; upgrading npm alone is insufficient.

## Release sequence

1. Update package.json/package-lock.json and integration/VERSION. Build SDK bundles via npm run build; npm prepack also rebuilds them.
2. Build Android with integration/android/gradlew :mobile-easy-use:publishReleasePublicationToLocalRepository from integration/android. Build iOS with bash integration/ios/Scripts/build-mobile-easy-use.sh from the repository root.
3. Package the Maven subtree for the new version only, iOS integration files, and the iOS Runner source/runtime dependencies. Asset layouts must match the platform ensure-artifacts.mjs consumers. Include SHA256SUMS.
4. Run Host/integration tests and simulator E2E against Apps rebuilt with the candidate integration. Check actual callback results, not only successful installation. Build success does not establish runtime compatibility.
5. Publish the npm package and GitHub Release v0.2.0 with these assets:
   - mobile-easy-use-android-maven-0.2.0.tar.gz
   - mobile-easy-use-ios-integration-0.2.0.tar.gz
   - mobile-easy-use-ios-runner-0.2.0.tar.gz
   - SHA256SUMS
6. Verify downloadable assets/checksums and npm availability. Commit the catalog update to the public master branch only after the combination is available.

Keep the catalog at its previous published state if any publication or validation step fails. The catalog being unavailable currently allows connection with a warning; it is not a substitute for native capability validation.
