import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { MobileMcpServer } from '../src/mcp-server.js';

const require = createRequire(import.meta.url);

function declarationRequest(platform) {
  return {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'get_sdk_declarations', arguments: { platform } },
  };
}

function disconnectedServer() {
  return new MobileMcpServer({}, {
    createConnection() { assert.fail('Reading declarations must not create a device connection'); },
  });
}

test('SDK declarations stay out of initialization and tool discovery', async () => {
  const server = disconnectedServer();
  const initialized = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tool = listed.result.tools.find(item => item.name === 'get_sdk_declarations');
  assert.deepEqual(tool.inputSchema.required, ['platform']);
  assert.deepEqual(tool.inputSchema.properties.platform.enum, ['android', 'ios']);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.openWorldHint, false);
  assert.deepEqual(tool.outputSchema.required, ['platform', 'sdkVersion', 'files']);
  assert.doesNotMatch(JSON.stringify([initialized, listed]), /declare global|interface Android|interface IOS/);
});

for (const platform of ['android', 'ios']) {
  test(`get_sdk_declarations locates ${platform} SDK and dependencies without sending their content`, async () => {
    const server = disconnectedServer();
    const initialized = await server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize' });
    const response = await server.handle(declarationRequest(platform));
    assert.equal(response.result.isError, false);
    const result = response.result.structuredContent;
    assert.deepEqual(Object.keys(result).sort(), ['files', 'platform', 'sdkVersion']);
    assert.equal(result.platform, platform);
    assert.equal(result.sdkVersion, initialized.result.serverInfo.version);
    assert.deepEqual(JSON.parse(response.result.content[0].text), result);
    const expected = [
      ['sdk', fileURLToPath(new URL('../package.json', import.meta.url)), `sdk/${platform}/index.d.ts`],
      ['bridge', require.resolve(`${platform === 'android' ? 'frida-java-bridge' : 'frida-objc-bridge'}/package.json`), 'index.d.ts'],
      ['gum', require.resolve('@types/frida-gum/package.json'), 'index.d.ts'],
    ];
    assert.equal(result.files.length, expected.length);
    for (const [index, [source, packagePath, relativePath]] of expected.entries()) {
      const { name, version } = JSON.parse(await readFile(packagePath, 'utf8'));
      const file = result.files[index];
      assert.equal(typeof file.description, 'string');
      assert.ok(file.description.trim().length > 0);
      assert.deepEqual(file, {
        source, description: file.description, packageName: name, packageVersion: version,
        path: await realpath(join(dirname(packagePath), relativePath)),
      });
      assert.equal(isAbsolute(file.path), true);
      assert.ok((await stat(file.path)).size > 0);
    }
    assert.doesNotMatch(JSON.stringify(response), /declare global|declare module|interface Android|interface IOS/);
    assert.equal(server.connections.size, 0);
  });
}

test('get_sdk_declarations rejects missing and invalid platforms as tool errors', async () => {
  const server = disconnectedServer();
  for (const platform of [undefined, null, '', 'Android', 'windows', '../ios', 'toString', {}, []]) {
    const response = await server.handle(declarationRequest(platform));
    assert.equal(response.result.isError, true);
    assert.equal(response.error, undefined);
    assert.equal(response.result.structuredContent.error, 'platform must be android or ios');
    assert.equal(response.result.structuredContent.content, undefined);
  }
  const request = declarationRequest('android');
  delete request.params.arguments;
  assert.equal((await server.handle(request)).result.isError, true);
  assert.equal(server.connections.size, 0);
});

test('declarations resolve from their installed package with explicit errors for broken installs', async t => {
  const installed = await mkdtemp(join(tmpdir(), 'mobile-easy-use-declarations-'));
  t.after(() => rm(installed, { recursive: true, force: true }));
  await mkdir(join(installed, 'src/mcp-api'), { recursive: true });
  await mkdir(join(installed, 'sdk/android'), { recursive: true });
  await writeFile(join(installed, 'package.json'), JSON.stringify({
    type: 'module', name: '@agent-easy-use/mobile-easy-use', version: '9.8.7',
  }));
  for (const file of ['src/package-info.js', 'src/mcp-api/sdk-declarations.js', 'sdk/android/index.d.ts']) {
    await copyFile(new URL(`../${file}`, import.meta.url), join(installed, file));
  }
  for (const name of ['frida-java-bridge', '@types/frida-gum']) {
    const directory = join(installed, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.2.3' }));
    await writeFile(join(directory, 'index.d.ts'), 'declare const fixtureOnly: true;');
  }
  const { getSdkDeclarations } = await import(pathToFileURL(join(installed, 'src/mcp-api/sdk-declarations.js')).href);
  const result = await getSdkDeclarations({ platform: 'android' });
  assert.equal(result.sdkVersion, '9.8.7');
  assert.equal(result.files[0].path, await realpath(join(installed, 'sdk/android/index.d.ts')));
  for (const file of result.files.slice(1)) {
    assert.equal(file.packageVersion, '1.2.3');
    assert.equal(file.path, await realpath(join(installed, 'node_modules', file.packageName, 'index.d.ts')));
  }
  const sdkPath = join(installed, 'sdk/android/index.d.ts');
  await rm(sdkPath);
  await assert.rejects(getSdkDeclarations({ platform: 'android' }), /sdk declarations are unavailable; reinstall/);
  await writeFile(sdkPath, '');
  await assert.rejects(getSdkDeclarations({ platform: 'android' }), /expected a non-empty declaration file/);
  await rm(sdkPath);
  await mkdir(sdkPath);
  await assert.rejects(getSdkDeclarations({ platform: 'android' }), /expected a non-empty declaration file/);
  await rm(sdkPath, { recursive: true });
  await writeFile(sdkPath, 'declare const fixtureSdk: true;');
  await rm(join(installed, 'node_modules/@types/frida-gum/index.d.ts'));
  await assert.rejects(getSdkDeclarations({ platform: 'android' }), /gum declarations are unavailable; reinstall/);
  await writeFile(join(installed, 'node_modules/@types/frida-gum/index.d.ts'), 'declare const fixtureGum: true;');
  await rm(join(installed, 'node_modules/frida-java-bridge/index.d.ts'));
  await assert.rejects(getSdkDeclarations({ platform: 'android' }), /bridge declarations are unavailable; reinstall/);
});
