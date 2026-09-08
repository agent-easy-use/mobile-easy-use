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
  let onMain = false;
  const queryCalls = [];
  const queryState = { view: null };
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
      const previous = onMain;
      onMain = true;
      try { work(); } finally { onMain = previous; }
    },
  };
  const list = (items) => ({ count: () => items.length, objectAtIndex_: (index) => items[index] });
  const space = { bounds: () => [[0, 0], [414, 896]] };
  const screen = { coordinateSpace: () => space, isEqual_: (other) => other === screen };
  const scene = { activationState: () => 0, interfaceOrientation: () => 1,
    windows: () => list([window]) };
  const window = { windowScene: () => scene, screen: () => screen, isKeyWindow: () => true,
    bounds: () => space.bounds(), convertRect_toCoordinateSpace_: () => space.bounds(),
    convertPoint_fromCoordinateSpace_: (point) => point, hitTest_withEvent_: () => null };
  ObjC.classes.UIScreen = { mainScreen: () => screen };
  const application = {
    connectedScenes: () => ({ allObjects: () => list([scene]) }),
  };
  ObjC.classes.UIApplication = { sharedApplication: () => application };
  ObjC.classes.NSMutableArray = { array: () => {
    const values = [];
    return { values, addObject_: (value) => values.push(value) };
  } };
  ObjC.classes.MEUUIQuery = {
    findUIView_(path) {
      queryCalls.push({ steps: [...path.values], onMain });
      return queryState.view;
    },
    stateForUIViewPath_: () => ({}),
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
  return { context, controllerRequests, ObjC, window, application, queryCalls, queryState,
    scheduled: () => scheduled, onMain: () => onMain };
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

test('all target types become screen points in the App without sending paths to the Runner', async () => {
  const fixture = createFixture();
  fixture.ObjC.classes.UIView = {};
  await loadSdk(fixture);
  const view = {
    isKindOfClass_: (type) => type === fixture.ObjC.classes.UIView,
    window: () => fixture.window,
    isHidden: () => false,
    alpha: () => 1,
    bounds: () => [[0, 0], [80, 40]],
    convertRect_toCoordinateSpace_: () => {
      assert.equal(fixture.onMain(), true);
      return [[20, 100], [80, 40]];
    },
    isUserInteractionEnabled: () => true,
    clipsToBounds: () => false,
    superview: () => null,
    isEqual_: (other) => other === view,
  };
  fixture.window.hitTest_withEvent_ = () => view;
  fixture.queryState.view = view;

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
      fixture.controllerRequests.map((request) => request.payload.command.point),
    )),
    [
      { x: 60, y: 120 },
      { x: 60, y: 120 },
      { x: 120, y: 360 },
      { x: 60, y: 120 },
    ],
  );
  assert.deepEqual(fixture.queryCalls, [
    { steps: ['identifier::login'], onMain: true },
    { steps: ['identifier::form', 'label::Login'], onMain: true },
  ]);
  assert.equal(
    fixture.controllerRequests.every((request) => (
      !Object.hasOwn(request.payload, 'runnerId')
      && !Object.hasOwn(request.payload.command, 'bundleId')
    )),
    true,
  );
  for (const request of fixture.controllerRequests) {
    assert.equal(request.payload.command.orientation, 1);
    assert.ok(request.payload.command.expiresAt > Date.now());
    assert.equal(Object.hasOwn(request.payload.command, 'target'), false);
    assert.equal(Object.hasOwn(request.payload.command, 'context'), false);
  }
  assert.throws(
    () => fixture.context.IOS.ui.find(['class::UIButton']),
    /Unsupported native UI path step: class/,
  );
});

test('UIView input clips the target and rejects occlusion before dispatch', async () => {
  const fixture = createFixture();
  fixture.ObjC.classes.UIView = {};
  await loadSdk(fixture);
  const parent = {
    isHidden: () => false, alpha: () => 1, isUserInteractionEnabled: () => true,
    clipsToBounds: () => true, superview: () => null, bounds: () => [[0, 0], [100, 100]],
    convertRect_toCoordinateSpace_: () => [[0, 0], [100, 100]],
  };
  const view = {
    isKindOfClass_: () => true, window: () => fixture.window,
    isHidden: () => false, alpha: () => 1, isUserInteractionEnabled: () => true,
    clipsToBounds: () => false, superview: () => parent,
    bounds: () => [[0, 0], [80, 40]],
    convertRect_toCoordinateSpace_: () => [[70, 80], [80, 40]],
    isEqual_: (other) => other === view,
  };
  fixture.window.hitTest_withEvent_ = () => view;
  assert.equal((await fixture.context.IOS.input.click(view)).ok, true);
  const command = fixture.controllerRequests[0].payload.command;
  assert.deepEqual(JSON.parse(JSON.stringify(command.point)), { x: 85, y: 90 });
  assert.deepEqual(JSON.parse(JSON.stringify(command.bounds)), { x: 70, y: 80, width: 30, height: 20 });
  fixture.queryState.view = view;
  assert.equal((await fixture.context.IOS.input.scroll(['identifier::feed'], 'up', 300)).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.controllerRequests[1].payload.command.gesture)), {
    startX: 85, startY: 99, endX: 85, endY: 81,
  });
  fixture.window.hitTest_withEvent_ = () => ({ isEqual_: () => false, isDescendantOfView_: () => false });
  const covered = await fixture.context.IOS.input.click('feed');
  assert.equal(covered.error.code, 'ELEMENT_NOT_HITTABLE');
  assert.equal(fixture.controllerRequests.length, 2);
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

test('coordinate input requires a foreground scene key window', async () => {
  const fixture = createFixture();
  fixture.application.connectedScenes = () => ({ allObjects: () => ({ count: () => 0 }) });
  await loadSdk(fixture);
  const result = await fixture.context.IOS.input.click({ x: 100, y: 100 });
  assert.equal(result.error.code, 'INVALID_TARGET');
  assert.equal(fixture.controllerRequests.length, 0);
});

test('invalid and missing App targets fail before any Runner request', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const results = await Promise.all([
    fixture.context.IOS.input.click('missing'),
    fixture.context.IOS.input.click([]),
    fixture.context.IOS.input.click(['class::UIButton']),
    fixture.context.IOS.input.click(''),
    fixture.context.IOS.input.click({ x: 9999, y: 100 }),
    fixture.context.IOS.input.click({ x: -1, y: 100 }),
    fixture.context.IOS.input.input('missing', ''),
    fixture.context.IOS.input.longPress({ x: 10, y: 10 }, 0),
    fixture.context.IOS.input.scroll({ x: 10, y: 10 }, 'diagonal', 100),
    fixture.context.IOS.input.scroll({ x: 10, y: 10 }, 'up', 0),
    fixture.context.IOS.input.scroll({ x: 10, y: 10 }, 'up', Infinity),
  ]);
  assert.deepEqual(results.map((result) => result.error.code), [
    'ELEMENT_NOT_FOUND', 'INVALID_TARGET', 'INVALID_TARGET', 'INVALID_TARGET',
    'INVALID_COORDINATES', 'INVALID_COORDINATES', 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'INVALID_ARGUMENT',
    'INVALID_ARGUMENT', 'INVALID_ARGUMENT',
  ]);
  assert.equal(fixture.queryCalls.length, 1);
  assert.equal(fixture.controllerRequests.length, 0);
});

test('text and long press parameters survive App coordinate normalization', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  await Promise.all([
    fixture.context.IOS.input.input({ x: 10, y: 20 }, '中文🙂\n'),
    fixture.context.IOS.input.longPress({ x: 30, y: 40 }),
  ]);
  const [text, press] = fixture.controllerRequests.map((request) => request.payload.command);
  assert.equal(text.text, '中文🙂\n');
  assert.equal(press.duration, 600);
  assert.deepEqual(JSON.parse(JSON.stringify(press.point)), { x: 30, y: 40 });
});

test('App main-queue delays consume the deadline and expired input is never sent', async () => {
  const fixture = createFixture();
  let now = Date.now();
  fixture.context.Date = { now: () => now };
  const schedule = fixture.ObjC.schedule;
  fixture.ObjC.schedule = (queue, work) => { now += 30000; schedule(queue, work); };
  await loadSdk(fixture);
  const result = await fixture.context.IOS.input.click({ x: 10, y: 20 });
  assert.equal(result.error.code, 'INPUT_TIMEOUT');
  assert.equal(fixture.controllerRequests.length, 0);
});
