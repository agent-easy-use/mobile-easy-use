"""Isolate Gadget's port while retaining APK native-library compression."""
import json
import os
import pathlib
import subprocess
import sys
import zipfile

mode = sys.argv[1]
assert mode in ('legacy', 'apk')
root = pathlib.Path('artifacts/benchmarks/debugger-agent-loading')
sdk = pathlib.Path(os.environ.get('ANDROID_SDK_ROOT', pathlib.Path.home() / 'Library/Android/sdk'))
tools = sdk / 'build-tools/35.0.0'
unsigned = root / (mode + '-unsigned.apk')
signed = root / (mode + '.apk')
with zipfile.ZipFile('fixtures/android/ApiDemo/app/build/outputs/apk/auto/debug/app-auto-debug.apk') as src, zipfile.ZipFile(unsigned, 'w') as dst:
    for entry in src.infolist():
        if entry.filename.startswith('META-INF/'):
            continue
        data = src.read(entry)
        if entry.filename.endswith('/libmobile_easy_use.config.so'):
            config = json.loads(data)
            config['interaction']['port'] = 18484
            data = json.dumps(config).encode()
        dst.writestr(entry, data)
subprocess.run([str(tools / 'zipalign'), '-f', '-P', '16', '4', str(unsigned), str(signed)], check=True)
subprocess.run([str(tools / 'apksigner'), 'sign', '--ks', str(pathlib.Path.home() / '.android/debug.keystore'), '--ks-pass', 'pass:android', str(signed)], check=True)
manifest = subprocess.check_output([str(tools / 'aapt2'), 'dump', 'xmltree', str(signed), '--file', 'AndroidManifest.xml'], text=True)
(root / (mode + '-manifest.txt')).write_text(manifest)
with zipfile.ZipFile(signed) as apk:
    libraries = [entry for entry in apk.infolist() if entry.filename.endswith('/libmobile_easy_use_native.so')]
    assert libraries, 'Missing SDK native agent'
    for entry in libraries:
        assert entry.compress_type == (zipfile.ZIP_STORED if mode == 'apk' else zipfile.ZIP_DEFLATED), entry.filename
extraction = [line for line in manifest.splitlines() if 'extractNativeLibs' in line]
assert len(extraction) == 1 and extraction[0].endswith('=false' if mode == 'apk' else '=true'), extraction
print(mode, extraction[0].strip(), 'agent ABIs:', len(libraries))
