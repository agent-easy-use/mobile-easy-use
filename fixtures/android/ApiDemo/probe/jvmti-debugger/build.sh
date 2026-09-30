#!/usr/bin/env bash
set -euo pipefail
# Run from repository root. Dependencies: Android SDK/NDK, JDK 17, npm install.
out=artifacts/benchmarks/jvmti-debugger-20260921
sdk=${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}
ndk=${DEBUGGER_NDK:-$sdk/ndk/29.0.14206865}
jdk=${DEBUGGER_JDK:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
mkdir -p "$out/include"
cp "$jdk/include/jvmti.h" "$out/include/"
"$ndk/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android31-clang++" \
  -shared -fPIC -std=c++17 -static-libstdc++ -I"$out/include" \
  fixtures/android/ApiDemo/probe/jvmti-debugger/agent.cpp -o "$out/libdebugger_proof.so"
node_modules/.bin/frida-compile fixtures/android/ApiDemo/probe/jvmti-debugger/agent.js -o "$out/agent.js" -S
fixtures/android/ApiDemo/gradlew -p fixtures/android/ApiDemo :app:assembleAutoDebug > "$out/build.log" 2>&1
python3 - <<'PY'
import zipfile,json
with zipfile.ZipFile('fixtures/android/ApiDemo/app/build/outputs/apk/auto/debug/app-auto-debug.apk') as a, zipfile.ZipFile('artifacts/benchmarks/jvmti-debugger-20260921/isolated-unsigned.apk','w') as b:
 for entry in a.infolist():
  if entry.filename.startswith('META-INF/'):continue
  data=a.read(entry)
  if entry.filename.endswith('/libmobile_easy_use.config.so'):
   cfg=json.loads(data);cfg['interaction']['port']=18484;data=json.dumps(cfg).encode()
  b.writestr(entry,data)
PY
"$sdk/build-tools/35.0.0/zipalign" -f -p 4 "$out/isolated-unsigned.apk" "$out/isolated.apk"
"$sdk/build-tools/35.0.0/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android "$out/isolated.apk"
if [[ $# -gt 0 ]]; then
  adb -s "$1" shell am force-stop com.agenteasyuse.mobileeasyuse.apidemo
  adb -s "$1" install --no-incremental -r "$out/isolated.apk"
  adb -s "$1" push "$out/libdebugger_proof.so" /data/local/tmp/libdebugger_proof.so
  adb -s "$1" shell run-as com.agenteasyuse.mobileeasyuse.apidemo mkdir -p files
  adb -s "$1" shell run-as com.agenteasyuse.mobileeasyuse.apidemo cp /data/local/tmp/libdebugger_proof.so files/libdebugger_proof.so
  adb -s "$1" shell am start -W -n com.agenteasyuse.mobileeasyuse.apidemo/.ui.MainActivity
fi
