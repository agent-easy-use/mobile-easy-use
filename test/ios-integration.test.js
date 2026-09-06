import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const iosCliPath = path.resolve('integration/ios/bin/mobile-easy-use-ios');
const embedScriptPath = path.resolve('integration/ios/Scripts/embed-mobile-easy-use.sh');

function runEmbedScript(configuration, args = []) {
  return spawnSync('bash', [embedScriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CONFIGURATION: configuration, PLATFORM_NAME: '' },
  });
}

test('iOS integration keeps the fixed runtime listen contract', async () => {
  const config = JSON.parse(await readFile(
    'integration/ios/MobileEasyUseRuntime.config',
    'utf8',
  ));

  assert.deepEqual(config.interaction, {
    type: 'listen',
    address: '0.0.0.0',
    port: 8484,
    on_port_conflict: 'fail',
    on_load: 'resume',
  });
  assert.equal(config.runtime, 'qjs');
  assert.equal(config.code_signing, 'optional');
});

test('iOS simulator runtime stays pinned before the iOS 26 unwind-broker regression', async () => {
  const runtime = await readFile(
    'integration/ios/Binaries/iphonesimulator/MobileEasyUseRuntime.dylib',
  );
  const digest = createHash('sha256').update(runtime).digest('hex');

  assert.equal(
    digest,
    '1655a0cdd0b2e84cbd8a5eb5cf20916af854212d495d1d3ce69e0050abad67c5',
  );
});

test('iOS embed hook defaults to Debug and accepts an explicit configuration', () => {
  assert.equal(runEmbedScript('Release').status, 0);
  assert.equal(runEmbedScript('InternalDebug').status, 0);

  const defaultMatch = runEmbedScript('Debug');
  assert.equal(defaultMatch.status, 1);
  assert.match(defaultMatch.stderr, /does not support platform '<missing>'/);

  const customMatch = runEmbedScript(
    'InternalDebug',
    ['--configuration', 'InternalDebug'],
  );
  assert.equal(customMatch.status, 1);
  assert.match(customMatch.stderr, /does not support platform '<missing>'/);

  assert.equal(
    runEmbedScript('Debug', ['--configuration', 'InternalDebug']).status,
    0,
  );
});

test('iOS embed hook rejects invalid configuration arguments', () => {
  const missingValue = runEmbedScript('Debug', ['--configuration']);
  assert.equal(missingValue.status, 2);
  assert.match(missingValue.stderr, /requires a value/);

  const unknown = runEmbedScript('Debug', ['--unknown']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown argument/);
});

test('iOS bridge dylibs contain native APIs and asynchronously bootstrap the Frida runtime', () => {
  for (const platform of ['iphoneos', 'iphonesimulator']) {
    const bridge = `integration/ios/Binaries/${platform}/MobileEasyUse.dylib`;
    const dependencies = spawnSync('otool', ['-L', bridge], { encoding: 'utf8' });
    assert.equal(dependencies.status, 0, dependencies.stderr);
    assert.doesNotMatch(dependencies.stdout, /@loader_path\/MobileEasyUseRuntime\.dylib/);

    const symbols = spawnSync('nm', ['-m', bridge], { encoding: 'utf8' });
    assert.equal(symbols.status, 0, symbols.stderr);
    assert.doesNotMatch(symbols.stdout, /_OBJC_CLASS_\$_MEUInput/);
    assert.match(symbols.stdout, /_OBJC_CLASS_\$_MEULog/);
    assert.match(symbols.stdout, /_OBJC_CLASS_\$_MEUScreenshot/);
    assert.match(symbols.stdout, /_OBJC_CLASS_\$_MEUUIQuery/);
    assert.match(symbols.stdout, /_mobile_easy_use_replace_nslog/);
    assert.match(symbols.stdout, /_mobile_easy_use_set_nslog_capture/);
    assert.match(symbols.stdout, /_mobile_easy_use_load_runtime_async/);
    assert.match(symbols.stdout, /_mobile_easy_use_runtime_bootstrap_status/);
    assert.match(symbols.stdout, /_mobile_easy_use_runtime_bootstrap_state/);
    assert.match(symbols.stdout, /_mobile_easy_use_runtime_bootstrap_error/);
  }
});

test('mobile-easy-use-ios resolves a device bundle ID and attaches its PID', async (t) => {
  if (process.platform !== 'darwin') {
    t.skip('the LLDB wrapper is macOS-only');
    return;
  }

  const fakeBin = await mkdtemp(path.join(os.tmpdir(), 'meu-ios-cli-'));
  t.after(async () => rm(fakeBin, { recursive: true, force: true }));

  const fakeSleep = path.join(fakeBin, 'sleep');
  await writeFile(fakeSleep, `#!/bin/bash
if [[ "$1" == "2" ]]; then exit 0; fi
exec /bin/sleep "$@"
`, 'utf8');
  await chmod(fakeSleep, 0o755);

  const fakeXcrun = path.join(fakeBin, 'xcrun');
  await writeFile(fakeXcrun, `#!/bin/bash
if [[ "$1" == "devicectl" ]]; then
  command="$*"
  if [[ " $command " == *" --console "* ]]; then
    while true; do sleep 1; done
  fi
  if [[ " $* " != *" --timeout 5 "* ]]; then
    echo "missing CoreDevice timeout" >&2
    exit 2
  fi
  if [[ " $* " == *" --terminate-existing "* ]]; then
    echo "must preserve an already-running process" >&2
    exit 2
  fi
  json_output=""
  log_output=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--json-output" ]]; then
      json_output="$2"
      shift 2
      continue
    fi
    if [[ "$1" == "--log-output" ]]; then
      log_output="$2"
      shift 2
      continue
    fi
    shift
  done
  [[ -n "$json_output" && -n "$log_output" ]] || exit 2
  if [[ " $command " == *" device info details "* ]]; then
    printf '{"result":{"identifier":"CORE-DEVICE-ID","hardwareProperties":{"udid":"HARDWARE-UDID"}}}' > "$json_output"
    exit 0
  fi
  if [[ " $command " == *" device process launch "* && " $command " == *" com.example.TestApp "* ]]; then
    printf '{"result":{"process":{"processIdentifier":2468,"executable":"file:///TestApp"}}}' > "$json_output"
    exit 0
  fi
  if [[ " $command " == *" device info ddiServices "* ]]; then
    printf '{"result":{"isUsable":true}}' > "$json_output"
    exit 0
  fi
  if [[ " $command " == *" device info processes "* ]]; then
    printf '{"result":{"runningProcesses":[{"processIdentifier":2468,"executable":"file:///TestApp"}]}}' > "$json_output"
    exit 0
  fi
  echo "unexpected CoreDevice command: $command" >&2
  exit 2
fi
if [[ "$1" != "lldb" ]]; then
  exit 2
fi
[[ "$MOBILE_EASY_USE_LLDB_MODE" == "device" ]] || exit 2
[[ "$MOBILE_EASY_USE_LLDB_TARGET" == "Test iPhone" ]] || exit 2
[[ "$MOBILE_EASY_USE_LLDB_PID" == "2468" ]] || exit 2
[[ "$MOBILE_EASY_USE_LLDB_TIMEOUT" == "5" ]] || exit 2
[[ " $* " == *" --batch "* ]] || exit 2
[[ " $* " == *" settings set target.preload-symbols false "* ]] || exit 2
[[ " $* " == *" settings set symbols.enable-external-lookup false "* ]] || exit 2
[[ " $* " == *" settings set symbols.load-on-demand true "* ]] || exit 2
[[ " $* " == *" settings set target.memory-module-load-level minimal "* ]] || exit 2
[[ " $* " != *" settings set target.process.run-all-threads "* ]] || exit 2
[[ " $* " != *" lldb.debugger.SetAsync(True) "* ]] || exit 2
[[ " $* " == *" device list "* ]] || exit 2
[[ " $* " == *" device select \\"HARDWARE-UDID\\" "* ]] || exit 2
[[ " $* " == *" device process attach -p 2468 "* ]] || exit 2
[[ " $* " == *" mobile-easy-use-load "* ]] || exit 2
printf '{"ok":true,"pid":2468,"attachState":"stopped","images":{"MobileEasyUse.dylib":[{}],"MobileEasyUseRuntime.dylib":[{}]},"detachState":"detached"}\n'
`, 'utf8');
  await chmod(fakeXcrun, 0o755);

  const result = spawnSync(
    iosCliPath,
    [
      'load',
      '--device', 'Test iPhone',
      '--bundle-id', 'com.example.TestApp',
      '--timeout', '5',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      timeout: 30_000,
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /device 'Test iPhone' and process 2468/);
  assert.match(result.stdout, /"attachState":"stopped"/);
  assert.match(result.stdout, /"MobileEasyUseRuntime\.dylib"/);
  assert.match(result.stdout, /"detachState":"detached"/);
});

test('mobile-easy-use-ios rejects the removed --process option', () => {
  const result = spawnSync(
    iosCliPath,
    ['load', '--device', 'Test iPhone', '--process', 'TestApp'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown argument: --process/);
  assert.doesNotMatch(result.stderr, /--process NAME/);
});

test('mobile-easy-use-ios retries transient CoreDevice launch-resolution timeouts', async (t) => {
  if (process.platform !== 'darwin') {
    t.skip('the LLDB wrapper is macOS-only');
    return;
  }

  const fakeBin = await mkdtemp(path.join(os.tmpdir(), 'meu-ios-coredevice-'));
  t.after(async () => rm(fakeBin, { recursive: true, force: true }));

  const fakeSleep = path.join(fakeBin, 'sleep');
  await writeFile(fakeSleep, `#!/bin/bash
if [[ "$1" == "2" ]]; then exit 0; fi
exec /bin/sleep "$@"
`, 'utf8');
  await chmod(fakeSleep, 0o755);

  const attemptFile = path.join(fakeBin, 'coredevice-attempts');
  const fakeXcrun = path.join(fakeBin, 'xcrun');
  await writeFile(fakeXcrun, `#!/bin/bash
if [[ "$1" == "devicectl" ]]; then
  command="$*"
  if [[ " $command " == *" --console "* ]]; then
    while true; do sleep 1; done
  fi
  if [[ " $* " != *" --timeout 5 "* ]]; then
    echo "missing CoreDevice timeout" >&2
    exit 2
  fi
  json_output=""
  log_output=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--json-output" ]]; then
      json_output="$2"
      shift 2
      continue
    fi
    if [[ "$1" == "--log-output" ]]; then
      log_output="$2"
      shift 2
      continue
    fi
    shift
  done
  [[ -n "$json_output" && -n "$log_output" ]] || exit 2
  if [[ " $command " == *" device info details "* ]]; then
    printf '{"result":{"identifier":"CORE-DEVICE-ID","hardwareProperties":{"udid":"HARDWARE-UDID"}}}' > "$json_output"
    exit 0
  fi
  if [[ " $command " == *" device info ddiServices "* ]]; then
    printf '{"result":{"isUsable":true}}' > "$json_output"
    exit 0
  fi
  if [[ " $command " == *" device info processes "* ]]; then
    printf '{"result":{"runningProcesses":[{"processIdentifier":2468,"executable":"file:///TestApp"}]}}' > "$json_output"
    exit 0
  fi
  [[ " $command " == *" device process launch "* ]] || exit 2
  attempt=0
  if [[ -f "${attemptFile}" ]]; then
    attempt="$(<"${attemptFile}")"
  fi
  attempt=$((attempt + 1))
  printf '%s' "$attempt" > "${attemptFile}"
  if (( attempt < 3 )); then
    echo "ERROR: Timed out waiting for CoreDeviceService to fully initialize." > "$log_output"
    exit 1
  fi
  printf '{"result":{"process":{"processIdentifier":2468,"executable":"file:///TestApp"}}}' > "$json_output"
  exit 0
fi
if [[ "$1" != "lldb" ]]; then
  exit 2
fi
[[ "$MOBILE_EASY_USE_LLDB_MODE" == "device" ]] || exit 2
[[ "$MOBILE_EASY_USE_LLDB_TARGET" == "Test iPhone" ]] || exit 2
[[ "$MOBILE_EASY_USE_LLDB_PID" == "2468" ]] || exit 2
[[ "$MOBILE_EASY_USE_LLDB_TIMEOUT" == "5" ]] || exit 2
[[ " $* " == *" --batch "* ]] || exit 2
[[ " $* " != *" settings set target.process.run-all-threads "* ]] || exit 2
[[ " $* " == *" device select \\"HARDWARE-UDID\\" "* ]] || exit 2
[[ " $* " == *" device process attach -p 2468 "* ]] || exit 2
[[ " $* " == *" mobile-easy-use-load "* ]] || exit 2
printf '{"ok":true,"pid":2468,"attachState":"stopped","images":{"MobileEasyUse.dylib":[{}],"MobileEasyUseRuntime.dylib":[{}]},"detachState":"detached"}\n'
`, 'utf8');
  await chmod(fakeXcrun, 0o755);

  const result = spawnSync(
    iosCliPath,
    [
      'load',
      '--device', 'Test iPhone',
      '--bundle-id', 'com.example.TestApp',
      '--timeout', '5',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      timeout: 30_000,
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(attemptFile, 'utf8'), '3');
  assert.match(result.stderr, /attempt 1\/3 timed out; retrying/);
  assert.match(result.stderr, /attempt 2\/3 timed out; retrying/);
  assert.match(result.stdout, /"MobileEasyUseRuntime\.dylib"/);
});

test('mobile-easy-use-ios loads a booted simulator through a local PID attach', async (t) => {
  if (process.platform !== 'darwin') {
    t.skip('the LLDB wrapper is macOS-only');
    return;
  }

  const fakeBin = await mkdtemp(path.join(os.tmpdir(), 'meu-ios-simulator-'));
  t.after(async () => rm(fakeBin, { recursive: true, force: true }));

  const fakeSleep = path.join(fakeBin, 'sleep');
  await writeFile(fakeSleep, `#!/bin/bash
if [[ "$1" == "2" ]]; then
  echo "simulator flow must not use the physical-device startup delay" >&2
  exit 99
fi
exec /bin/sleep "$@"
`, 'utf8');
  await chmod(fakeSleep, 0o755);

  const commandLog = path.join(fakeBin, 'commands');
  const fakeXcrun = path.join(fakeBin, 'xcrun');
  await writeFile(fakeXcrun, `#!/bin/bash
if [[ "$1" == "devicectl" ]]; then
  echo "simulator flow must not call CoreDevice" >&2
  exit 2
fi
if [[ "$1" == "simctl" && "$2" == "getenv" ]]; then
  echo "SIMULATOR-UDID"
  exit 0
fi
if [[ "$1" == "simctl" && "$2" == "launch" ]]; then
  if [[ " $* " == *" --terminate-running-process "* ]]; then
    echo "must preserve an already-running simulator process" >&2
    exit 2
  fi
  echo "com.example.TestApp: 3579"
  exit 0
fi
if [[ "$1" != "lldb" ]]; then
  exit 2
fi
printf 'mode=%s\ntarget=%s\npid=%s\ntimeout=%s\nargs=%s\n' \
  "$MOBILE_EASY_USE_LLDB_MODE" \
  "$MOBILE_EASY_USE_LLDB_TARGET" \
  "$MOBILE_EASY_USE_LLDB_PID" \
  "$MOBILE_EASY_USE_LLDB_TIMEOUT" \
  "$*" > "${commandLog}"
printf '{"ok":true,"pid":3579,"attachState":"stopped","images":{"MobileEasyUse.dylib":[{}],"MobileEasyUseRuntime.dylib":[{}]},"detachState":"detached"}\n'
`, 'utf8');
  await chmod(fakeXcrun, 0o755);

  const result = spawnSync(
    iosCliPath,
    [
      'load',
      '--simulator', 'iPhone Test',
      '--bundle-id', 'com.example.TestApp',
      '--timeout', '5',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      timeout: 10_000,
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /simulator 'iPhone Test' and process 3579/);
  assert.match(result.stdout, /"MobileEasyUseRuntime\.dylib"/);
  const commands = await readFile(commandLog, 'utf8');
  assert.match(commands, /^mode=simulator$/m);
  assert.match(commands, /^target=iPhone Test$/m);
  assert.match(commands, /^pid=3579$/m);
  assert.match(commands, /--batch/);
  assert.match(commands, /process attach --pid 3579/);
  assert.doesNotMatch(commands, /device select/);
  assert.match(commands, /mobile-easy-use-load/);
});

test('iOS integration scripts are valid shell programs', () => {
  for (const script of [
    'integration/ios/Scripts/build-mobile-easy-use.sh',
    'integration/ios/Scripts/embed-mobile-easy-use.sh',
    'integration/ios/Scripts/load-mobile-easy-use.sh',
    'integration/ios/bin/mobile-easy-use-ios',
  ]) {
    const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  }
});
