#!/usr/bin/env bash
set -euo pipefail
# Run from repository root. Each mode installs and restarts ApiDemo.
serial=${1:?Usage: run.sh <adb-serial>}
fixture=fixtures/android/ApiDemo/probe/debugger-agent-loading
output=artifacts/benchmarks/debugger-agent-loading
mkdir -p "$output"
integration/android/gradlew -p integration/android :mobile-easy-use:publishReleasePublicationToLocalRepository > "$output/aar-build.log" 2>&1
node_modules/.bin/frida-compile "$fixture/agent.js" -o "$output/agent.bundle.js" -S
for mode in legacy apk; do
  legacy=false
  if [[ "$mode" == legacy ]]; then legacy=true; fi
  fixtures/android/ApiDemo/gradlew -p fixtures/android/ApiDemo -I "$PWD/$fixture/packaging.init.gradle" -I "$PWD/fixtures/android/ApiDemo/probe/debugger-mvp/no-locals.init.gradle" -PagentTestLegacyPackaging="$legacy" :app:assembleAutoDebug --refresh-dependencies > "$output/$mode-build.log" 2>&1
  python3 "$fixture/package.py" "$mode"
  adb -s "$serial" shell am force-stop com.agenteasyuse.mobileeasyuse.apidemo
  adb -s "$serial" install --no-incremental -r "$output/$mode.apk"
  adb -s "$serial" shell am start -W -n com.agenteasyuse.mobileeasyuse.apidemo/.ui.MainActivity
  node "$fixture/run.mjs" "$serial" "$mode"
done
