import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sdkEntry = new URL('../sdk/ios/index.js', import.meta.url);

async function loadSdk(fixture) {
  const modulePromises = new Map();
  const getModule = async (url) => {
    const identifier = url.href;
    if (!modulePromises.has(identifier)) {
      modulePromises.set(identifier, readFile(url, 'utf8').then((source) => (
        new vm.SourceTextModule(source, { context: fixture.context, identifier })
      )));
    }
    return modulePromises.get(identifier);
  };
  const entry = await getModule(sdkEntry);
  await entry.link(async (specifier, referencingModule) => {
    if (specifier === 'frida-objc-bridge') {
      const bridgeId = 'fixture:frida-objc-bridge';
      if (!modulePromises.has(bridgeId)) {
        modulePromises.set(bridgeId, Promise.resolve(new vm.SyntheticModule(
          ['default'],
          function setBridgeExport() {
            this.setExport('default', fixture.ObjC);
          },
          { context: fixture.context, identifier: bridgeId },
        )));
      }
      return modulePromises.get(bridgeId);
    }
    return getModule(new URL(specifier, referencingModule.identifier));
  });
  await entry.evaluate();
}

function createFixture() {
  let scheduled = 0;
  const controllerReceivers = new Map();
  const controllerRequests = [];
  const ObjC = {
    available: true,
    classes: {
      NSBundle: {
        mainBundle: () => ({ bundleIdentifier: () => ({ toString: () => 'com.example.app' }) }),
      },
    },
    mainQueue: {},
    schedule(queue, work) {
      assert.equal(queue, ObjC.mainQueue);
      scheduled += 1;
      work();
    },
  };
  const context = vm.createContext({
    ArrayBuffer,
    ObjC,
    NULL: null,
    Promise,
    clearTimeout,
    recv(type, handler) {
      controllerReceivers.set(type, handler);
    },
    send(event) {
      controllerRequests.push(event.payload);
      const request = event.payload;
      const type = `mobile-easy-use.controller.response.${request.requestId}`;
      const responsePayload = {
        ok: true,
        action: request.payload.command.action,
        mode: 'semantic',
      };
      queueMicrotask(() => controllerReceivers.get(type)?.({
        payload: {
          ok: true,
          responsePayload,
        },
      }));
    },
    rpc: {},
    setTimeout,
  });
  return { context, controllerRequests, ObjC, scheduled: () => scheduled };
}

test('IOS exposes runOnMainThread with value and failure propagation', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  assert.deepEqual(
    Array.from(Object.keys(fixture.context.IOS).sort()),
    ['input', 'runOnMainThread', 'screenshot', 'ui', 'wait'],
  );
  assert.equal(typeof fixture.context.IOS.screenshot, 'function');
  assert.equal(await fixture.context.IOS.runOnMainThread(() => 42), 42);
  assert.equal(await fixture.context.IOS.runOnMainThread(async () => 'async'), 'async');
  assert.equal(fixture.scheduled(), 2);
  await assert.rejects(
    fixture.context.IOS.runOnMainThread(() => { throw new Error('main failed'); }),
    /main failed/,
  );
  await assert.rejects(
    fixture.context.IOS.runOnMainThread(null),
    /Main-thread work must be a function/,
  );
  fixture.ObjC.available = false;
  assert.throws(
    () => fixture.context.IOS.runOnMainThread(() => {}),
    /Objective-C runtime is unavailable/,
  );
});

test('iOS input sends serializable targets to the Host Controller', async () => {
  const fixture = createFixture();
  fixture.ObjC.classes.UIView = {};
  await loadSdk(fixture);
  const view = {
    isKindOfClass_: (type) => type === fixture.ObjC.classes.UIView,
    window: () => ({}),
    isHidden: () => false,
    alpha: () => 1,
    bounds: () => [[0, 0], [80, 40]],
    convertRect_toView_: () => [[20, 100], [80, 40]],
  };

  await Promise.all([
    fixture.context.IOS.input.click('login'),
    fixture.context.IOS.input.click(['identifier::form', 'label::Login']),
    fixture.context.IOS.input.click({ x: 120, y: 360 }),
    fixture.context.IOS.input.click(view),
  ]);

  assert.deepEqual(
    fixture.controllerRequests.map((request) => request.action),
    ['ios.input.perform', 'ios.input.perform', 'ios.input.perform', 'ios.input.perform'],
  );
  assert.deepEqual(
    fixture.controllerRequests.map((request) => request.payload.command.action),
    ['click', 'click', 'click', 'click'],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      fixture.controllerRequests.map((request) => request.payload.command.target),
    )),
    [
      { type: 'identifier', value: 'login' },
      { type: 'path', steps: ['identifier::form', 'label::Login'] },
      { type: 'location', x: 120, y: 360 },
      { type: 'location', x: 60, y: 120, bounds: { x: 20, y: 100, width: 80, height: 40 } },
    ],
  );
  assert.equal(
    fixture.controllerRequests.every((request) => (
      !Object.hasOwn(request.payload, 'runnerId')
      && !Object.hasOwn(request.payload.command, 'bundleId')
    )),
    true,
  );
  assert.throws(
    () => fixture.context.IOS.ui.find(['class::UIButton']),
    /Unsupported native UI path step: class/,
  );
});

test('iOS runtimeStatus only reports the target App runtime', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  const status = await fixture.context.runtimeStatus();

  assert.equal(status.platform, 'ios');
  assert.equal(status.available, true);
  assert.equal(status.appId, 'com.example.app');
  assert.deepEqual(fixture.controllerRequests, []);
});
