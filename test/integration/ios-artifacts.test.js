import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

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

test('iOS simulator runtime stays pinned before the iOS 26 unwind-broker regression', async (t) => {
  const runtimePath = 'integration/ios/Binaries/iphonesimulator/MobileEasyUseRuntime.dylib';
  if (!existsSync(runtimePath)) {
    t.skip('Restore the iOS binaries from GitHub Release to validate the Runtime artifact');
    return;
  }
  const runtime = await readFile(runtimePath);
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

test('iOS bridge dylibs contain native APIs without linking the Frida runtime', (t) => {
  if (process.platform !== 'darwin' || !['iphoneos', 'iphonesimulator'].every(
    platform => existsSync(`integration/ios/Binaries/${platform}/MobileEasyUse.dylib`),
  )) {
    t.skip('macOS and locally built or restored iOS bridge binaries are required');
    return;
  }
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
    for (const symbol of ['register_nslog_watch', 'unregister_nslog_watch']) {
      assert.ok(symbols.stdout.includes(`_mobile_easy_use_${symbol}`), symbol);
    }
    assert.match(symbols.stdout, /_mobile_easy_use_version/);
    assert.doesNotMatch(symbols.stdout, /_mobile_easy_use_load_runtime_async/);
    assert.doesNotMatch(symbols.stdout, /_mobile_easy_use_runtime_bootstrap_/);
  }
});

test('iOS integration scripts are valid shell programs', () => {
  for (const script of [
    'integration/ios/Scripts/build-mobile-easy-use.sh',
    'integration/ios/Scripts/embed-mobile-easy-use.sh',
    'runners/ios-xctest/scripts/embed-runtime.sh',
  ]) {
    const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  }
});
