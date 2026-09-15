import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const overrideEntry = new URL('../sdk/ios/override/index.js', import.meta.url);
const chainEntry = new URL('../sdk/ios/probe/evidence/chain.js', import.meta.url);

async function loadModule(entryUrl, fixture) {
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
  const entry = await getModule(entryUrl);
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
  return entry.namespace;
}

test('iOS Override.run replaces matching returns and restores the IMP', async () => {
  let originalCalls = 0;
  const original = (_handle, _command, scene) => {
    originalCalls += 1;
    return `original:${scene}`;
  };
  const fixture = createFixture('- regionForScene:', original);
  const { Override } = await loadModule(overrideEntry, fixture);

  const result = Override.run(
    [{
      target: 'RegionProvider',
      selector: '- regionForScene:',
      filter: (invocation) => invocation.args[0] === 'form',
      withReturn: 'JP',
    }],
    () => ({
      form: fixture.method.implementation(fixture.receiver, null, 'form'),
      feed: fixture.method.implementation(fixture.receiver, null, 'feed'),
    }),
  );

  assert.deepEqual(result, { form: 'JP', feed: 'original:feed' });
  assert.equal(originalCalls, 1);
  assert.equal(fixture.method.implementation, original);
});

test('iOS Override resolves a short string target through runtime class discovery', async () => {
  const original = () => 'US';
  const fixture = createFixture('- currentRegion', original);
  const targetClass = fixture.ObjC.classes.RegionProvider;
  delete fixture.ObjC.classes.RegionProvider;
  targetClass.$className = 'MyApp.RegionProvider';
  fixture.ObjC.classes['MyApp.RegionProvider'] = targetClass;
  fixture.ObjC.classes['Other.RegionProvider'] = {
    $className: 'Other.RegionProvider',
    '- unrelated': { implementation: () => undefined },
  };
  const { Override } = await loadModule(overrideEntry, fixture);

  const result = Override.run(
    [{ target: 'RegionProvider', selector: '- currentRegion', withReturn: 'JP' }],
    () => fixture.method.implementation(fixture.receiver, null),
  );

  assert.equal(result, 'JP');
  assert.equal(fixture.method.implementation, original);
});

test('iOS Override.run marshals JavaScript booleans as native BOOL values', async () => {
  const original = () => 0;
  const fixture = createFixture('- isEnabled', original);
  const { Override } = await loadModule(overrideEntry, fixture);

  const result = Override.run(
    [{ target: 'RegionProvider', selector: '- isEnabled', withReturn: true }],
    () => fixture.method.implementation(fixture.receiver, null),
  );

  assert.equal(result, 1);
  assert.equal(fixture.method.implementation, original);
});

test('iOS Override.run protects withReturn and cleans up after Promise settlement', async () => {
  const original = () => 'US';
  const fixture = createFixture('+ currentRegion', original);
  const { Override } = await loadModule(overrideEntry, fixture);
  let resolveAction;

  const result = Override.run(
    [{
      target: 'RegionProvider',
      selector: '+ currentRegion',
      withReturn() {
        throw new Error('replacement failed');
      },
    }],
    () => new Promise((resolve) => {
      resolveAction = () => resolve(fixture.method.implementation(fixture.receiver, null));
    }),
  );

  assert.notEqual(fixture.method.implementation, original);
  resolveAction();
  assert.equal(await result, 'US');
  assert.equal(fixture.method.implementation, original);
  assert.equal(
    fixture.events.some((event) => event.channel === 'override.callback_error'
      && event.payload.phase === 'withReturn'),
    true,
  );
});

test('iOS Override fallback calls a throwing original implementation only once', async () => {
  let originalCalls = 0;
  const appError = new Error('app failed');
  const original = () => {
    originalCalls += 1;
    throw appError;
  };
  const fixture = createFixture('- currentRegion', original);
  const { Override } = await loadModule(overrideEntry, fixture);

  assert.throws(
    () => Override.run(
      [{
        target: 'RegionProvider',
        selector: '- currentRegion',
        filter: () => false,
        withReturn: 'JP',
      }],
      () => fixture.method.implementation(fixture.receiver, null),
    ),
    (error) => error === appError,
  );
  assert.equal(originalCalls, 1);
  assert.equal(fixture.method.implementation, original);
});

test('iOS Override.run restores earlier IMPs when later installation fails', async () => {
  const original = () => 'US';
  const fixture = createFixture('- currentRegion', original);
  const { Override } = await loadModule(overrideEntry, fixture);
  let actionCalled = false;

  assert.throws(
    () => Override.run(
      [
        { target: 'RegionProvider', selector: '- currentRegion', withReturn: 'JP' },
        { target: 'RegionProvider', selector: '- missing', withReturn: 'JP' },
      ],
      () => { actionCalled = true; },
    ),
    /Objective-C class not found/,
  );
  assert.equal(actionCalled, false);
  assert.equal(fixture.method.implementation, original);
});

test('iOS Override and chain evidence require an explicit selector prefix', async () => {
  const fixture = createFixture('- currentRegion', () => 'US');
  const { Override } = await loadModule(overrideEntry, fixture);
  const { withChainEvidence } = await loadModule(chainEntry, fixture);

  assert.throws(
    () => Override.run(
      [{ target: 'RegionProvider', selector: 'currentRegion', withReturn: 'JP' }],
      () => {},
    ),
    /selector must start with '- ' or '\+ '/,
  );
  await assert.rejects(
    () => withChainEvidence(
      () => {},
      'Read region',
      undefined,
      [{ target: 'RegionProvider', selector: 'currentRegion' }],
    ),
    /selector must start with '- ' or '\+ '/,
  );
});

test('iOS withChainEvidence requires method hooks in the new fourth argument', async () => {
  const fixture = createFixture('- currentRegion', () => 'US');
  const { withChainEvidence } = await loadModule(chainEntry, fixture);

  await assert.rejects(
    () => withChainEvidence(
      () => {},
      'Read region',
      [{ target: 'RegionProvider', selector: '- currentRegion' }],
    ),
    /logTag must be a string, Set<string>, or undefined/,
  );
});

test('iOS chain evidence resolves a short string target through runtime class discovery', async () => {
  const fixture = createFixture('- currentRegion', () => 'US');
  const targetClass = fixture.ObjC.classes.RegionProvider;
  delete fixture.ObjC.classes.RegionProvider;
  targetClass.$className = 'MyApp.RegionProvider';
  fixture.ObjC.classes['MyApp.RegionProvider'] = targetClass;
  fixture.ObjC.classes['Other.RegionProvider'] = {
    $className: 'Other.RegionProvider',
    '- unrelated': { implementation: () => undefined },
  };
  const { withChainEvidence } = await loadModule(chainEntry, fixture);

  const result = await withChainEvidence(
    () => 'done',
    'Read region',
    undefined,
    [{ target: 'RegionProvider', selector: '- currentRegion' }],
  );

  assert.equal(result, 'done');
});

test('iOS chain evidence streams static and dynamic NSLog TAGs without changing original logs', async () => {
  const fixture = createFixture('- currentRegion', () => 'US');
  const { withChainEvidence } = await loadModule(chainEntry, fixture);

  const result = await withChainEvidence(
    () => {
      fixture.emitNSLog('[Network] request failed: %@', '[Network] request failed: timeout');
      assert.equal(fixture.evidenceRecords().length, 1, 'evidence must stream before return');
      fixture.emitNSLog('[%@]request failed', '[Network]request failed', 'Network');
      fixture.emitNSLog('[%@] ignored', '[Other] ignored', 'Other');
      fixture.emitNSLog('[Other] ignored', '[Other] ignored');
      return 'done';
    },
    'Submit request',
    new Set(['Network', 'Auth']),
  );

  assert.equal(result, 'done');
  assert.deepEqual(fixture.originalLogs, [
    '[Network] request failed: timeout',
    '[Network]request failed',
    '[Other] ignored',
    '[Other] ignored',
  ]);
  assert.deepEqual(fixture.evidenceRecords().map((record) => record.payload), [
    {
      type: 'log',
      threadName: null,
      actionDescription: 'Submit request',
      level: 'default',
      tag: 'Network',
      message: '[Network] request failed: timeout',
    },
    {
      type: 'log',
      threadName: null,
      actionDescription: 'Submit request',
      level: 'default',
      tag: 'Network',
      message: '[Network]request failed',
    },
  ]);
  assert.equal(fixture.isNSLogReplaced(), false);
});

test('iOS chain evidence keeps the NSLog replacement through Promise settlement and reuses the native replacement', async () => {
  const fixture = createFixture('- currentRegion', () => 'US');
  const { withChainEvidence } = await loadModule(chainEntry, fixture);
  let resolveAction;
  let firstReplacement;

  const pending = withChainEvidence(
    () => new Promise((resolve) => {
      firstReplacement = fixture.currentNSLogReplacement();
      resolveAction = resolve;
    }),
    'First action',
    'Form',
  );

  assert.equal(fixture.isNSLogReplaced(), true);
  resolveAction('done');
  assert.equal(await pending, 'done');
  assert.equal(fixture.isNSLogReplaced(), false);

  let secondReplacement;
  await withChainEvidence(
    () => { secondReplacement = fixture.currentNSLogReplacement(); },
    'Second action',
    'Form',
  );

  assert.equal(secondReplacement, firstReplacement);
});

test('iOS chain evidence rolls back the NSLog replacement when a method hook fails', async () => {
  const fixture = createFixture('- currentRegion', () => 'US');
  const { withChainEvidence } = await loadModule(chainEntry, fixture);
  let actionCalled = false;

  await assert.rejects(
    () => withChainEvidence(
      () => { actionCalled = true; },
      'Broken action',
      'Network',
      [{ target: 'RegionProvider', selector: '- missing' }],
    ),
    /Objective-C class not found/,
  );
  assert.equal(actionCalled, false);
  assert.equal(fixture.isNSLogReplaced(), false);
});

function createFixture(selector, originalImplementation) {
  const method = { implementation: originalImplementation };
  const targetClass = {
    $className: 'RegionProvider',
    [selector]: method,
  };
  const events = [];
  const evidenceLines = [];
  const originalLogs = [];
  let nslogReplacement = null;
  let nativeCapture = { filters: null, count: 0, callback: null };
  const receiver = { $className: 'RegionProvider' };
  function ObjCObject(handle) {
    return handle;
  }
  const ObjC = {
    available: true,
    classes: { RegionProvider: targetClass },
    Object: ObjCObject,
    implement: (_method, implementation) => implementation,
  };
  const nativePointer = (value) => ({
    value,
    isNull: () => value === null || value === 0,
    readUtf8String: () => value,
  });
  const pointerSize = 8;
  function allocatePointerData() {
    const slots = new Map();
    const pointerAt = (offset) => ({
      add: (amount) => pointerAt(offset + amount),
      isNull: () => false,
      readPointer: () => slots.get(offset),
      writePointer(value) {
        slots.set(offset, value);
      },
    });
    return pointerAt(0);
  }
  function NativeCallback(callback) {
    return callback;
  }
  function NativeFunction(callback) {
    return callback;
  }
  const nslogTarget = { symbol: 'NSLog' };
  const replacementTarget = { symbol: 'mobile_easy_use_replace_nslog' };
  const setCaptureTarget = (filters, count, callback) => {
    nativeCapture = {
      filters: count > 0 ? filters : null,
      count,
      callback: typeof callback === 'function' ? callback : null,
    };
  };
  const nativeSymbols = new Map([
    ['NSLog', nslogTarget],
    ['mobile_easy_use_replace_nslog', replacementTarget],
    ['mobile_easy_use_set_nslog_capture', setCaptureTarget],
  ]);
  const Interceptor = {
    attach() {
      return { detach() {} };
    },
    flush() {},
    replace(target, replacement) {
      if (target !== nslogTarget) throw new Error('unexpected replacement target');
      nslogReplacement = replacement;
    },
    revert(target) {
      if (target !== nslogTarget) throw new Error('unexpected revert target');
      nslogReplacement = null;
    },
  };
  const emitNSLog = (rawFormat, renderedMessage, dynamicTag = null) => {
    if (nslogReplacement === replacementTarget && nativeCapture.filters) {
      for (let index = 0; index < nativeCapture.count; index += 1) {
        const entry = nativeCapture.filters.add(index * pointerSize * 2);
        const tagPointer = entry.readPointer();
        const prefixPointer = entry.add(pointerSize).readPointer();
        const literalMatch = rawFormat.startsWith(prefixPointer.value);
        const dynamicMatch = rawFormat.startsWith('[%@]')
          && dynamicTag === tagPointer.value;
        if (!literalMatch && !dynamicMatch) continue;
        nativeCapture.callback?.(tagPointer, nativePointer(renderedMessage));
        break;
      }
    }
    originalLogs.push(renderedMessage);
  };
  const context = vm.createContext({
    console: { log: (line) => evidenceLines.push(line), warn() {} },
    Date,
    Interceptor,
    Memory: {
      alloc: allocatePointerData,
      allocUtf8String: nativePointer,
    },
    Module: {
      getGlobalExportByName(symbol) {
        const value = nativeSymbols.get(symbol);
        if (!value) throw new Error(`missing native symbol: ${symbol}`);
        return value;
      },
    },
    NativeCallback,
    NativeFunction,
    ObjC,
    Process: {
      pointerSize,
      getModuleByName(name) {
        if (name !== 'MobileEasyUse.dylib') {
          throw new Error(`missing native module: ${name}`);
        }
        return {
          getExportByName(symbol) {
            const value = nativeSymbols.get(symbol);
            if (!value || symbol === 'NSLog') {
              throw new Error(`missing bridge symbol: ${symbol}`);
            }
            return value;
          },
        };
      },
    },
    Promise,
    ptr: nativePointer,
    send: (event) => events.push(event),
    Set,
  });
  return {
    context,
    currentNSLogReplacement: () => nslogReplacement,
    emitNSLog,
    evidenceRecords: () => evidenceLines
      .filter((line) => line.startsWith('@@MOBILE_EVIDENCE@@'))
      .map((line) => JSON.parse(line.slice('@@MOBILE_EVIDENCE@@'.length))),
    events,
    isNSLogReplaced: () => nslogReplacement !== null,
    method,
    ObjC,
    originalLogs,
    receiver,
  };
}
