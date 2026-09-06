# Android SDK ApiDemo

Dedicated fixture App for packaged MobileEasyUse Android SDK capability tests.

Build the injected Android SDK bundle, publish the integration AAR, then build with ApiDemo's
Gradle 8.11.1 wrapper:

```bash
npm --prefix ../../.. run build:android
../../../integration/android/gradlew -p ../../../integration/android \
  :mobile-easy-use:publishReleasePublicationToLocalRepository
./gradlew :app:assembleAutoDebug
```

The normal test package is `com.agenteasyuse.mobileeasyuse.apidemo`. The manual flavor uses
`.manual`; the SDK-free release flavor uses `.none`.

`MainActivity` exposes Input, UI, R / Resources, Wait, Window, Override, and Evidence items. Runtime
probes live under `probe/` as `probe.js`/`probe.d.ts` Module pairs. Execute exactly one exported probe
at a time through an agent using `skills/to-android-run`; this project has no standalone probe runner.
The screenshot probes cover a Window plus visible-element crop and a terminal Driver failure image.
