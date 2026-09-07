import assert from 'node:assert/strict';
import test from 'node:test';
import { loadIOSRuntime } from '../src/ios/load/runtime-loader.js';

function loaderResult(loadState = 'loaded') {
  return {
    ok: true,
    loadState,
    detachState: 'detached',
    images: {
      'MobileEasyUse.dylib': [{ path: '/App/Frameworks/MobileEasyUse.dylib' }],
      'MobileEasyUseRuntime.dylib': [{ path: '/App/Frameworks/MobileEasyUseRuntime.dylib' }],
    },
  };
}

test('iOS Runtime Loader selects a booted simulator and accepts an idempotent result', async () => {
  const calls = [];
  const result = await loadIOSRuntime({
    deviceId: 'SIMULATOR-UDID',
    appId: 'com.example.app',
  }, {
    loadScript: '/test/load-mobile-easy-use.sh',
    execute: async (command, args) => {
      calls.push({ command, args });
      if (command === 'xcrun') return { stdout: 'SIMULATOR-UDID\n', stderr: '' };
      return {
        stdout: `Starting LLDB...\n${JSON.stringify(loaderResult('already-loaded'))}\n`,
        stderr: '',
      };
    },
  });

  assert.equal(result.loadState, 'already-loaded');
  assert.deepEqual(calls, [
    {
      command: 'xcrun',
      args: ['simctl', 'getenv', 'SIMULATOR-UDID', 'SIMULATOR_UDID'],
    },
    {
      command: '/test/load-mobile-easy-use.sh',
      args: [
        '--simulator', 'SIMULATOR-UDID',
        '--bundle-id', 'com.example.app',
      ],
    },
  ]);
});

test('iOS Runtime Loader falls back to a physical device target', async () => {
  const calls = [];
  await loadIOSRuntime({ deviceId: 'CORE-DEVICE-ID', appId: 'com.example.app' }, {
    loadScript: '/test/load-mobile-easy-use.sh',
    execute: async (command, args) => {
      calls.push({ command, args });
      if (command === 'xcrun') throw new Error('not a booted simulator');
      return { stdout: `${JSON.stringify(loaderResult())}\n`, stderr: '' };
    },
  });

  assert.deepEqual(calls[1], {
    command: '/test/load-mobile-easy-use.sh',
    args: ['--device', 'CORE-DEVICE-ID', '--bundle-id', 'com.example.app'],
  });
});

test('iOS Runtime Loader rejects incomplete image state', async () => {
  const invalid = loaderResult();
  invalid.images['MobileEasyUseRuntime.dylib'] = [];

  await assert.rejects(
    loadIOSRuntime({ deviceId: 'SIMULATOR-UDID', appId: 'com.example.app' }, {
      loadScript: '/test/load-mobile-easy-use.sh',
      execute: async (command) => command === 'xcrun'
        ? { stdout: 'SIMULATOR-UDID\n', stderr: '' }
        : { stdout: `${JSON.stringify(invalid)}\n`, stderr: '' },
    }),
    /expected exactly one MobileEasyUseRuntime\.dylib/,
  );
});
