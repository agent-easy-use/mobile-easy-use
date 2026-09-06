# Android integration validation

This checklist applies after the user requests verification.

1. Build the selected variant with its exact Gradle task.
2. Inspect the selected variant's dependency report and merged manifest. Confirm the AAR is present and:
   - automatic mode contains `MobileEasyUseInitProvider`; or
   - manual mode removes the provider and contains the requested `MobileEasyUse.initialize()` call.
3. Inspect the APK. Confirm `libmobile_easy_use.so` and its adjacent config exist for every packaged ABI. When a production/store comparison is safely buildable, confirm its packaging boundary excludes these files.
4. With the user's connected test device, install and launch the selected APK. Check for startup crashes before continuing.
5. Run `adb forward tcp:18484 tcp:8484`, connect MobileEasyUse to `127.0.0.1:18484`, and perform one read-only UI/state query. Treat a successful connection and response as runtime validation.
6. Report each command, artifact, and result. For a failed step, preserve the evidence and diagnose the failing layer.
