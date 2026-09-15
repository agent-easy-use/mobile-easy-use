import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function driverFixture() {
  const dispatched = [];
  const state = { foreground: 4, orientation: 3, beforeSubmit: () => {} };
  const unexpectedAX = () => { throw new Error('Runner must not query AX'); };
  const app = { state: () => state.foreground, waitForState_timeout_: () => true,
    interfaceOrientation: () => state.orientation, release() {}, frame: unexpectedAX,
    descendantsMatchingType_: unexpectedAX, coordinateWithNormalizedOffset_: unexpectedAX };
  const ObjC = { available: true, mainQueue: {},
    schedule(queue, work) { setImmediate(work); },
    classes: {
      NSAutoreleasePool: { alloc: () => ({ init() { return this; }, release() {} }) },
      XCUIApplication: { alloc: () => ({ initWithBundleIdentifier_: () => app }) },
    },
  };
  const backend = { assertReady(deadline) {
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('INPUT_TIMEOUT: expired');
  }, async perform(command, options) {
    state.beforeSubmit(); options.beforeSubmit(); dispatched.push(command);
  } };
  const context = vm.createContext({ rpc: {}, setTimeout, clearTimeout, Error });
  const cache = new Map();
  async function module(url) {
    if (!cache.has(url.href)) cache.set(url.href, readFile(url, 'utf8').then((source) => (
      new vm.SourceTextModule(source, { context, identifier: url.href })
    )));
    return cache.get(url.href);
  }
  const entry = await module(new URL('../sdk/runners/ios-xctest-driver.js', import.meta.url));
  await entry.link((specifier, parent) => {
    if (specifier === 'frida-objc-bridge') return new vm.SyntheticModule(['default'], function () {
      this.setExport('default', ObjC);
    }, { context });
    if (specifier.endsWith('/events.js')) return new vm.SyntheticModule(['createEventBackend'], function () {
      this.setExport('createEventBackend', () => backend);
    }, { context });
    return module(new URL(specifier, parent.identifier));
  });
  await entry.evaluate();
  await context.rpc.exports.bind('com.example.app');
  return { driver: context.rpc.exports, dispatched, state };
}

function command(action = 'click') {
  return { action, point: { x: 60, y: 80 },
    bounds: { x: 0, y: 0, width: 896, height: 414 }, orientation: 3,
    expiresAt: Date.now() + 29000 };
}

test('all four coordinate APIs preserve results and route to the event backend without AX', async () => {
  const { driver, dispatched } = await driverFixture();
  for (const action of ['click', 'longPress', 'scroll', 'input']) {
    const result = await driver.perform({ ...command(action),
      duration: 800, distance: 100, direction: 'up', text: 'hello',
      gesture: { startX: 60, startY: 82, endX: 60, endY: 78 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.action, action);
    assert.equal(result.mode, 'semantic');
    if (action === 'input') assert.equal(result.textLength, 5);
    if (action === 'scroll') {
      assert.equal(result.startY, 82);
      assert.equal(result.endY, 78); // Preserve App endpoints; never recalculate from distance.
      assert.equal(result.distance, 100);
    }
  }
  assert.equal(dispatched.length, 4);
  assert.ok(dispatched.every((command) => command.orientation === 3));
});

test('invalid, expired, rotated and background input fails without dispatch', async () => {
  const { driver, dispatched, state } = await driverFixture();
  const request = command();
  assert.equal((await driver.perform({ ...request, action: 'input', text: '' })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await driver.perform({ ...request, action: 'longPress', duration: 0 })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await driver.perform({ ...request, expiresAt: Date.now() - 1 })).error.code, 'INPUT_TIMEOUT');
  assert.equal((await driver.perform({ ...request, expiresAt: undefined })).error.code, 'INPUT_TIMEOUT');
  assert.equal((await driver.perform({ ...request, point: { x: 9999, y: 80 } })).error.code, 'INVALID_COORDINATES');
  assert.equal((await driver.perform({ ...request, point: undefined })).error.code, 'INVALID_COORDINATES');
  assert.equal((await driver.perform({ ...request, orientation: 1 })).error.code, 'INVALID_COORDINATES');
  assert.equal((await driver.perform({ ...request, orientation: undefined })).error.code, 'INVALID_COORDINATES');
  assert.equal((await driver.perform({ ...request, action: 'scroll', direction: 'up', distance: 100,
    gesture: { startX: 60, startY: 80, endX: NaN, endY: 70 } })).error.code, 'INVALID_COORDINATES');
  assert.equal((await driver.perform({ ...request, action: 'scroll', direction: 'up', distance: 100,
    gesture: { startX: 60, startY: 80, endX: 60, endY: 80 } })).error.code, 'INVALID_COORDINATES');
  state.foreground = 2;
  assert.equal((await driver.perform(request)).error.code, 'TARGET_NOT_FOREGROUND');
  assert.equal(dispatched.length, 0);
});

test('Runner checks foreground and orientation immediately before event submission', async () => {
  const { driver, dispatched, state } = await driverFixture();
  state.beforeSubmit = () => { state.orientation = 1; };
  assert.equal((await driver.perform(command())).error.code, 'INVALID_COORDINATES');
  state.orientation = 3;
  state.beforeSubmit = () => { state.foreground = 2; };
  assert.equal((await driver.perform(command())).error.code, 'TARGET_NOT_FOREGROUND');
  assert.equal(dispatched.length, 0);
});
