import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = path.join(root, 'test/native/ui-query');

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'meu-ui-query-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Android production query traverses trees and matches superclass names in Java', t => {
  if (spawnSync('javac', ['-version']).status !== 0) {
    t.skip('JDK is required');
    return;
  }
  const output = temporaryDirectory(t);
  execFileSync('javac', ['-d', output,
    path.join(root, 'integration/android/mobile-easy-use/src/main/java/com/agenteasyuse/mobileeasyuse/internal/MEUUIQuery.java'),
    path.join(fixtures, 'android/view/View.java'),
    path.join(fixtures, 'android/view/ViewGroup.java'),
    path.join(fixtures, 'AndroidUIQueryTest.java'),
  ]);
  assert.match(execFileSync('java', ['-cp', output, 'AndroidUIQueryTest'], { encoding: 'utf8' }),
    /Android native UI query passed/);
});

test('iOS production query matches UIKit subclasses in the simulator', t => {
  if (process.platform !== 'darwin') {
    t.skip('Xcode and a booted iOS simulator are required');
    return;
  }
  const devices = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' });
  const device = devices.status === 0
    ? Object.values(JSON.parse(devices.stdout).devices).flat().find(item => item.state === 'Booted')
    : null;
  if (!device) {
    t.skip('A booted iOS simulator is required');
    return;
  }
  const output = path.join(temporaryDirectory(t), 'ui-query-test');
  const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim();
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const sources = path.join(root, 'integration/ios/Sources/Internal');
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-target', `${architecture}-apple-ios14.0-simulator`,
    '-isysroot', sdk, '-I', sources, path.join(sources, 'MEUUIQuery.m'),
    path.join(fixtures, 'IOSUIQueryTest.m'), '-framework', 'Foundation', '-framework', 'UIKit', '-o', output,
  ]);
  assert.match(execFileSync('xcrun', ['simctl', 'spawn', device.udid, output], { encoding: 'utf8', timeout: 30000 }),
    /iOS native UI query passed/);
});
