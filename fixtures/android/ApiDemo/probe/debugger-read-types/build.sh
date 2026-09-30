#!/usr/bin/env bash
set -euo pipefail
# Run from repository root. Rebuild the actual SDK agent/AAR, not the historical proof agent.
out=artifacts/benchmarks/debugger-read-types
sdk=${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}
mkdir -p "$out"
integration/android/gradlew -p integration/android :mobile-easy-use:publishReleasePublicationToLocalRepository > "$out/aar-build.log" 2>&1
node_modules/.bin/frida-compile fixtures/android/ApiDemo/probe/debugger-read-types/agent.js -o "$out/agent.js" -S
fixtures/android/ApiDemo/gradlew -p fixtures/android/ApiDemo -I "$PWD/fixtures/android/ApiDemo/probe/debugger-mvp/no-locals.init.gradle" :app:assembleAutoDebug --refresh-dependencies > "$out/app-build.log" 2>&1
python3 - <<'PY'
import json, zipfile
with zipfile.ZipFile('fixtures/android/ApiDemo/app/build/outputs/apk/auto/debug/app-auto-debug.apk') as apk, zipfile.ZipFile('artifacts/benchmarks/debugger-read-types/isolated-unsigned.apk', 'w') as patched:
    for entry in apk.infolist():
        if entry.filename.startswith('META-INF/'):
            continue
        data = apk.read(entry)
        if entry.filename.endswith('/libmobile_easy_use.config.so'):
            config = json.loads(data)
            config['interaction']['port'] = 18484
            data = json.dumps(config).encode()
        patched.writestr(entry, data)
PY
"$sdk/build-tools/35.0.0/zipalign" -f -p 4 "$out/isolated-unsigned.apk" "$out/isolated.apk"
"$sdk/build-tools/35.0.0/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android "$out/isolated.apk"
if [[ $# -gt 0 ]]; then
  adb -s "$1" shell am force-stop com.agenteasyuse.mobileeasyuse.apidemo
  adb -s "$1" install --no-incremental -r "$out/isolated.apk"
  adb -s "$1" shell am start -W -n com.agenteasyuse.mobileeasyuse.apidemo/.ui.MainActivity
fi
