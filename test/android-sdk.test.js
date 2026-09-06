import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sdkEntry = new URL('../sdk/android/index.js', import.meta.url);
const mainThreadEntry = new URL('../sdk/android/common/main-thread.js', import.meta.url);

async function loadAndroidModule(entryUrl, fixture) {
  const modulePromises = new Map();
  const getModule = async (url) => {
    const identifier = url.href;
    if (!modulePromises.has(identifier)) {
      modulePromises.set(identifier, readFile(url, 'utf8').then((source) => (
        new vm.SourceTextModule(source, {
          context: fixture.context,
          identifier,
        })
      )));
    }
    return modulePromises.get(identifier);
  };
  const entry = await getModule(entryUrl);
  await entry.link(async (specifier, referencingModule) => {
    if (specifier === 'frida-java-bridge') {
      const bridgeId = 'fixture:frida-java-bridge';
      if (!modulePromises.has(bridgeId)) {
        modulePromises.set(bridgeId, Promise.resolve(new vm.SyntheticModule(
          ['default'],
          function setBridgeExport() {
            this.setExport('default', fixture.Java);
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

async function loadSdk(fixture) {
  return loadAndroidModule(sdkEntry, fixture);
}

test('Android common runOnMainThread schedules work and preserves failures', async () => {
  const fixture = createFixture();
  let scheduled = 0;
  fixture.Java.scheduleOnMainThread = (work) => {
    scheduled += 1;
    work();
  };
  const { requireJavaRuntime, runOnMainThread } = await loadAndroidModule(
    mainThreadEntry,
    fixture,
  );

  requireJavaRuntime();
  assert.equal(await runOnMainThread(() => 42), 42);
  assert.equal(scheduled, 1);
  await assert.rejects(runOnMainThread(null), /Main-thread work must be a function/);
  await assert.rejects(
    runOnMainThread(() => { throw new Error('main failed'); }),
    /main failed/,
  );
  fixture.Java.available = false;
  assert.throws(() => runOnMainThread(() => {}), /Java runtime is unavailable/);
});

test('SDK exposes native, extension, resource, and probe namespaces', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  assert.equal(typeof fixture.context.Mobile, 'undefined');
  assert.equal(typeof fixture.context.AndroidBridge, 'undefined');
  assert.equal(typeof fixture.context.android, 'undefined');
  assert.equal(fixture.context.Java, fixture.Java);
  assert.equal(fixture.context.Java.use('android.os.Looper'), fixture.Looper);
  assert.equal(fixture.context.Java.use('android.os.Looper').getMainLooper(), fixture.mainLooper);
  assert.equal(fixture.context.R.id.test_button, 1001);
  assert.equal(fixture.context.AndroidExp.window.getRootViews()[0], fixture.rootView);
  assert.equal(await fixture.context.AndroidExp.runOnMainThread(() => 'main'), 'main');
  assert.deepEqual(
    Array.from(Object.keys(fixture.context.AndroidExp).sort()),
    ['input', 'runOnMainThread', 'screenshot', 'ui', 'wait', 'window'],
  );
  assert.equal(typeof fixture.context.AndroidExp.ui.find, 'function');
  assert.equal(typeof fixture.context.AndroidExp.screenshot, 'function');
  assert.equal(typeof fixture.context.Override.run, 'function');
  assert.equal(typeof fixture.context.Probe.runtime, 'undefined');
  assert.equal(typeof fixture.context.Probe.events, 'undefined');
  assert.equal(typeof fixture.context.Probe.reflect, 'undefined');
  assert.equal(typeof fixture.context.Probe.cleanup, 'undefined');
  assert.equal(typeof fixture.context.Probe.handles, 'undefined');
  assert.equal(typeof fixture.context.Probe.version, 'undefined');
  assert.equal(typeof fixture.context.Probe.hook, 'undefined');
  assert.deepEqual(Array.from(Object.keys(fixture.context.Probe)), ['evidence']);
  assert.deepEqual(
    Array.from(Object.keys(fixture.context.Probe.evidence).sort()),
    ['withChainEvidence', 'withStateEvidence', 'withUiEvidence'],
  );
  assert.equal(typeof fixture.context.Probe.evidence.withChainEvidence, 'function');
  assert.equal(typeof fixture.context.Probe.evidence.withStateEvidence, 'function');
  assert.equal(typeof fixture.context.Probe.evidence.withUiEvidence, 'function');
  assert.deepEqual(
    Array.from(Object.keys(fixture.context.AndroidExp.input).sort()),
    ['click', 'input', 'longPress', 'scroll'],
  );
  assert.deepEqual(
    Array.from(Object.keys(fixture.context.AndroidExp.wait).sort()),
    ['ui', 'until'],
  );
});

test('AndroidExp.screenshot returns elements by default and optionally includes the Window', async () => {
  const fixture = createFixture({
    screenshotArtifactRecords: [
      { scope: 'window', uiKey: null, mimeType: 'image/jpeg', width: 1080, height: 1920 },
      { scope: 'element', uiKey: 'button', mimeType: 'image/jpeg', width: 200, height: 100 },
    ],
  });
  await loadSdk(fixture);

  const windowOnly = structuredClone(await fixture.context.AndroidExp.screenshot());
  assert.equal(windowOnly.ok, true);
  assert.match(windowOnly.window, /^\/host\/screenshots\/.+\/window\.jpg$/);
  assert.deepEqual(windowOnly.targets, {});

  const elementOnly = structuredClone(await fixture.context.AndroidExp.screenshot({
    targets: { button: 1001 },
  }));
  assert.equal(elementOnly.ok, true);
  assert.equal(elementOnly.window, undefined);
  assert.match(elementOnly.targets.button, /^\/host\/screenshots\/.+\/target-0\.jpg$/);

  const windowAndElement = structuredClone(await fixture.context.AndroidExp.screenshot({
    targets: { button: 1001 },
    includeWindow: true,
  }));
  assert.equal(windowAndElement.ok, true);
  assert.match(windowAndElement.window, /^\/host\/screenshots\/.+\/window\.jpg$/);
  assert.match(windowAndElement.targets.button, /^\/host\/screenshots\/.+\/target-0\.jpg$/);
  assert.ok(fixture.sentEvents.every((event) => event.channel === 'controller.request'));
  assert.ok(fixture.sentEvents.every((event) => event.payload.action === 'file.write'));
  assert.ok(fixture.sentEvents.every((event) => (
    typeof event.payload.payload.filePath === 'string'
    && !Object.hasOwn(event.payload.payload, 'blob')
  )));
  assert.ok(fixture.sentEvents.every((event) => (
    !Object.hasOwn(event.payload.payload, 'actionDescription')
    && !Object.hasOwn(event.payload.payload, 'checkpoint')
  )));
  assert.match(
    (await fixture.context.AndroidExp.screenshot({ quality: 100 })).error.message,
    /does not support option: quality/,
  );
});

test('AndroidExp.window supports getRootViews(IBinder) framework variants', async () => {
  const fixture = createFixture();
  const WindowManagerGlobal = fixture.Java.use('android.view.WindowManagerGlobal');
  const binderOverload = overload(
    ['android.os.IBinder'],
    () => javaCollection([fixture.rootView]),
  );
  const getRootViews = () => {
    throw new Error('argument types do not match');
  };
  getRootViews.overload = (...types) => (
    types.join(',') === 'android.os.IBinder' ? binderOverload : undefined
  );
  WindowManagerGlobal.getInstance = javaMethod(() => javaObject('android.view.WindowManagerGlobal', {
    getRootViews,
  }));
  await loadSdk(fixture);

  assert.deepEqual(
    Array.from(fixture.context.AndroidExp.window.getRootViews()),
    [fixture.rootView],
  );
});

test('AndroidExp.window casts concrete root wrappers to android.view.View', async () => {
  const fixture = createFixture();
  const WindowManagerGlobal = fixture.Java.use('android.view.WindowManagerGlobal');
  const concreteRoot = javaObject('com.android.internal.policy.DecorView');
  let castClassName = null;
  fixture.Java.cast = (value, targetClass) => {
    if (value === concreteRoot) {
      castClassName = targetClass.$className;
      return fixture.rootView;
    }
    return value;
  };
  WindowManagerGlobal.getInstance = javaMethod(() => javaObject('android.view.WindowManagerGlobal', {
    getRootViews: javaMethod(() => javaCollection([concreteRoot])),
  }));
  await loadSdk(fixture);

  assert.deepEqual(
    Array.from(fixture.context.AndroidExp.window.getRootViews()),
    [fixture.rootView],
  );
  assert.equal(castClassName, 'android.view.View');
});

test('AndroidExp.window falls back to the private mViews field', async () => {
  const fixture = createFixture();
  const WindowManagerGlobal = fixture.Java.use('android.view.WindowManagerGlobal');
  const mViews = Object.create({
    get value() {
      return javaCollection([fixture.rootView]);
    },
  });
  WindowManagerGlobal.getInstance = javaMethod(() => javaObject('android.view.WindowManagerGlobal', {
    mViews,
  }));
  await loadSdk(fixture);

  assert.deepEqual(
    Array.from(fixture.context.AndroidExp.window.getRootViews()),
    [fixture.rootView],
  );
});

test('AndroidExp.window uses mRoots when public APIs and OEM mViews are stale', async () => {
  const fixture = createFixture();
  const WindowManagerGlobal = fixture.Java.use('android.view.WindowManagerGlobal');
  const staleRoot = javaObject('android.view.View');
  const rootImpl = javaObject('android.view.ViewRootImpl', {
    mView: { value: fixture.rootView },
  });
  const binderOverload = overload(
    ['android.os.IBinder'],
    () => javaCollection([]),
  );
  const getRootViews = () => {
    throw new Error('argument types do not match');
  };
  getRootViews.overload = (...types) => (
    types.join(',') === 'android.os.IBinder' ? binderOverload : undefined
  );
  WindowManagerGlobal.getInstance = javaMethod(() => javaObject('android.view.WindowManagerGlobal', {
    getRootViews,
    mRoots: { value: javaCollection([rootImpl]) },
    mViews: { value: javaCollection([staleRoot]) },
  }));
  await loadSdk(fixture);

  assert.deepEqual(
    Array.from(fixture.context.AndroidExp.window.getRootViews()),
    [fixture.rootView],
  );
});

test('AndroidExp.ui.find resolves native id, text, tag, and getter path steps', async () => {
  const fixture = createFixture();
  const taggedView = fixture.button;
  const ignoredTextView = javaObject('android.widget.TextView', {
    findViewWithTag: javaMethod(() => {
      throw new Error('text:: must not continue from the second match');
    }),
  });
  const textView = javaObject('android.widget.TextView', {
    findViewWithTag: javaMethod((tag) => (String(tag) === 'target' ? taggedView : null)),
  });
  const panel = javaObject('android.view.ViewGroup', {
    findViewsWithText: javaMethod((matches, text) => {
      if (String(text) === 'AI-generated') {
        matches.add(textView);
        matches.add(ignoredTextView);
      }
    }),
    findViewWithTag: javaMethod((tag) => (String(tag) === 'target' ? taggedView : null)),
  });
  fixture.rootView.findViewById = javaMethod((id) => (id === 4001 ? panel : null));
  await loadSdk(fixture);

  const nativePath = [`id::4001`, 'text::AI-generated', 'tag::target'];
  assert.equal(fixture.context.AndroidExp.ui.find(4001).$raw, panel);
  assert.equal(fixture.context.AndroidExp.ui.find(nativePath).$raw, taggedView);
  assert.equal(
    fixture.context.AndroidExp.ui.find([`id::4001`, (root) => root.findViewWithTag('target')]).$raw,
    taggedView,
  );
  assert.equal(
    fixture.context.AndroidExp.ui.find([(root) => root.findViewById(4001)]).$raw,
    panel,
  );
  assert.equal(fixture.context.AndroidExp.ui.find([`id::4001`, 'tag::missing']), null);
  assert.throws(
    () => fixture.context.AndroidExp.ui.find([() => fixture.activity]),
    /getter must return an android\.view\.View/,
  );
  assert.throws(() => fixture.context.AndroidExp.ui.find(0), /positive integer/);
  assert.throws(() => fixture.context.AndroidExp.ui.find(['class::android.view.View']), /Invalid UI path/);
});

test('AndroidExp.ui.find casts native roots to View and getter inputs to runtime classes', async () => {
  const fixture = createFixture();
  const castTargets = [];
  const originalCast = fixture.Java.cast;
  fixture.Java.cast = (value, targetClass) => {
    castTargets.push([value.$className, targetClass.$className]);
    return originalCast(value, targetClass);
  };
  await loadSdk(fixture);

  let getterInputClass = null;
  const found = fixture.context.AndroidExp.ui.find([
    `id::${fixture.context.R.id.test_button}`,
    (view) => {
      getterInputClass = view.$className;
      return view;
    },
  ]);

  assert.equal(getterInputClass, 'android.widget.Button');
  assert.equal(found.$className, 'android.widget.Button');
  assert.equal(
    castTargets.some(([valueClass, targetClass]) => (
      valueClass === 'android.view.View' && targetClass === 'android.view.View'
    )),
    true,
  );
  assert.equal(
    castTargets.filter(([, targetClass]) => targetClass === 'android.widget.Button').length,
    2,
  );
});

test('AndroidExp.ui.find restores View methods on generic intermediate wrappers', async () => {
  const fixture = createFixture();
  const panel = javaObject('android.view.ViewGroup', {
    findViewWithTag: javaMethod(() => fixture.button),
  });
  const genericPanel = javaObject('com.example.Panel');
  fixture.rootView.findViewById = javaMethod(() => genericPanel);
  const castTargets = [];
  const originalCast = fixture.Java.cast;
  fixture.Java.cast = (value, targetClass) => {
    castTargets.push([value, targetClass.$className]);
    if (value === genericPanel && targetClass.$className === 'android.view.View') {
      return panel;
    }
    return originalCast(value, targetClass);
  };
  await loadSdk(fixture);

  const found = fixture.context.AndroidExp.ui.find(['id::4001', 'tag::target']);

  assert.equal(found.$raw, fixture.button);
  assert.equal(
    castTargets.some(([value, className]) => value === genericPanel && className === 'android.view.View'),
    true,
  );
});

test('AndroidExp.wait.until polls only synchronous boolean predicates', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  let checks = 0;

  const success = await fixture.context.AndroidExp.wait.until(() => {
    checks += 1;
    if (checks < 3) {
      throw new Error('state is not readable yet');
    }
    return true;
  }, { timeoutMs: 50, intervalMs: 1 });

  assert.equal(success.ok, true);
  assert.equal(checks, 3);

  const invalid = await fixture.context.AndroidExp.wait.until(
    () => Promise.resolve(true),
    { timeoutMs: 50, intervalMs: 1 },
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_ARGUMENT');

  const timeout = await fixture.context.AndroidExp.wait.until(
    () => false,
    { timeoutMs: 5, intervalMs: 1 },
  );
  assert.equal(timeout.ok, false);
  assert.equal(timeout.error.code, 'TIMEOUT');

  const failedCheck = await fixture.context.AndroidExp.wait.until(
    () => {
      throw new Error('state unavailable');
    },
    { timeoutMs: 5, intervalMs: 1 },
  );
  assert.equal(failedCheck.error.code, 'TIMEOUT');
  assert.equal(failedCheck.error.lastCheckError, 'state unavailable');
});

test('AndroidExp.wait.ui re-resolves IDs in the focused Window and tracks View state', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  const visible = await fixture.context.AndroidExp.wait.ui(
    fixture.context.R.id.test_button,
    'visible',
  );
  assert.equal(visible.ok, true);

  let dynamicVisible = false;
  fixture.rootView.findViewById = javaMethod((id) => {
    if (id === 1001) return fixture.button;
    return id === 3003 && dynamicVisible ? fixture.button : null;
  });
  setTimeout(() => {
    dynamicVisible = true;
  }, 2);
  const appeared = await fixture.context.AndroidExp.wait.ui(
    3003,
    'exist',
    { timeoutMs: 50, intervalMs: 1 },
  );
  assert.equal(appeared.ok, true);

  fixture.button.isShown = javaMethod(() => false);
  const gone = await fixture.context.AndroidExp.wait.ui(fixture.button, 'gone');
  assert.equal(gone.ok, true);

  const invalidView = await fixture.context.AndroidExp.wait.ui(fixture.activity, 'exist');
  assert.equal(invalidView.ok, false);
  assert.equal(invalidView.error.code, 'INVALID_ARGUMENT');

  fixture.rootView.hasWindowFocus = javaMethod(() => false);
  const noFocusedWindow = await fixture.context.AndroidExp.wait.ui(
    2002,
    'gone',
    { timeoutMs: 5, intervalMs: 1 },
  );
  assert.equal(noFocusedWindow.ok, false);
  assert.equal(noFocusedWindow.error.code, 'TIMEOUT');
});

test('AndroidExp.wait.ui and input actions resolve UI paths', async () => {
  const fixture = createFixture();
  fixture.rootView.findViewWithTag = javaMethod((tag) => (
    String(tag) === 'action' ? fixture.button : null
  ));
  await loadSdk(fixture);
  const path = ['tag::action'];

  const visible = await fixture.context.AndroidExp.wait.ui(path, 'visible');
  const clicked = await fixture.context.AndroidExp.input.click(path);

  assert.equal(visible.ok, true);
  assert.equal(clicked.ok, true);
  assert.equal(clicked.targetType, 'path');
});

test('AndroidExp.input high-level actions accept resource ID, View, and screen location targets', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const view = fixture.context.AndroidExp.window
    .getRootViews()[0]
    .findViewById(fixture.context.R.id.test_button);
  const targets = [fixture.context.R.id.test_button, view, { x: 200, y: 350 }];

  for (const target of targets) {
    const eventsBeforeClick = fixture.injectedEvents.length;
    const click = await fixture.context.AndroidExp.input.click(target);
    assert.equal(click.ok, true);
    assert.equal(click.action, 'click');
    assert.equal(click.x, 200);
    assert.equal(click.y, 350);
    assert.deepEqual(
      fixture.injectedEvents.slice(eventsBeforeClick).map((event) => event.mode),
      [0, 0],
    );

    const eventsBeforeLongPress = fixture.injectedEvents.length;
    const longPress = await fixture.context.AndroidExp.input.longPress(target);
    assert.equal(longPress.ok, true);
    assert.equal(longPress.action, 'longPress');
    assert.equal(longPress.durationMs, 600);
    assert.deepEqual(
      fixture.injectedEvents.slice(eventsBeforeLongPress).map((event) => event.mode),
      [0, 0],
    );

    const eventsBeforeScroll = fixture.injectedEvents.length;
    const scroll = await fixture.context.AndroidExp.input.scroll(target, 'up');
    assert.equal(scroll.ok, true);
    assert.equal(scroll.action, 'scroll');
    assert.ok(scroll.startY > scroll.endY);
    const scrollModes = fixture.injectedEvents
      .slice(eventsBeforeScroll)
      .map((event) => event.mode);
    assert.ok(scrollModes.slice(0, -1).every((mode) => mode === 0));
    assert.equal(scrollModes.at(-1), 0);

    const eventsBeforeInput = fixture.injectedEvents.length;
    const input = await fixture.context.AndroidExp.input.input(target, 'a');
    assert.equal(input.ok, true);
    assert.equal(input.action, 'input');
    assert.equal(input.textLength, 1);
    assert.equal(input.injectedEvents, 4);
    assert.deepEqual(
      fixture.injectedEvents.slice(eventsBeforeInput).map((event) => event.mode),
      [0, 0, 0, 0],
    );
  }
});

test('resource ID targets resolve only inside the focused Window root', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  const focusedResult = await fixture.context.AndroidExp.input.click(fixture.context.R.id.test_button);
  assert.equal(focusedResult.ok, true);

  const hiddenWindowResult = await fixture.context.AndroidExp.input.click(2002);
  assert.equal(hiddenWindowResult.ok, false);
  assert.equal(hiddenWindowResult.error.code, 'VIEW_NOT_FOUND');

  fixture.rootView.hasWindowFocus = javaMethod(() => false);
  const unfocusedResult = await fixture.context.AndroidExp.input.click(fixture.context.R.id.test_button);
  assert.equal(unfocusedResult.ok, false);
  assert.equal(unfocusedResult.error.code, 'FOCUSED_WINDOW_UNAVAILABLE');
});

test('resource ID targets cast custom View wrappers to android.view.View', async () => {
  const fixture = createFixture();
  const customView = javaObject('com.example.CustomView');
  fixture.rootView.findViewById = javaMethod(() => customView);
  fixture.Java.cast = (value) => (value === customView ? fixture.button : value);
  await loadSdk(fixture);

  const click = await fixture.context.AndroidExp.input.click(fixture.context.R.id.test_button);

  assert.equal(click.ok, true);
  assert.equal(click.x, 200);
  assert.equal(click.y, 350);
});

test('AndroidExp.ui.find lazily promotes method results when declared wrappers omit members', async () => {
  const fixture = createFixture();
  const declaredText = javaObject('android.widget.TextView');
  const runtimeText = javaObject('android.widget.TextView', {
    length: javaMethod(() => 4),
  });
  fixture.button.getText = javaMethod(() => declaredText);
  const originalCast = fixture.Java.cast;
  let runtimeCastCount = 0;
  fixture.Java.cast = (value, targetClass) => {
    if (value === declaredText && targetClass.$className === declaredText.$className) {
      runtimeCastCount += 1;
      return runtimeText;
    }
    return originalCast(value, targetClass);
  };
  await loadSdk(fixture);

  const input = fixture.context.AndroidExp.ui.find(fixture.context.R.id.test_button);
  const text = input.getText();

  assert.equal(runtimeCastCount, 0);
  assert.equal(text.length(), 4);
  assert.equal(text.length(), 4);
  assert.equal(runtimeCastCount, 1);
});

test('AndroidExp.ui.find promotes Java method results before calling toString', async () => {
  const fixture = createFixture();
  const declaredText = javaObject('android.widget.TextView', {
    toString: Object.prototype.toString,
  });
  const runtimeText = javaObject('android.widget.TextView', {
    toString: javaMethod(() => 'frida42'),
  });
  fixture.button.getText = javaMethod(() => declaredText);
  const originalCast = fixture.Java.cast;
  fixture.Java.cast = (value, targetClass) => (
    value === declaredText && targetClass.$className === declaredText.$className
      ? runtimeText
      : originalCast(value, targetClass)
  );
  await loadSdk(fixture);

  const input = fixture.context.AndroidExp.ui.find(fixture.context.R.id.test_button);

  assert.equal(input.getText().toString(), 'frida42');
});

test('AndroidExp.wait.ui casts custom View wrappers to android.view.View', async () => {
  const fixture = createFixture();
  const customView = javaObject('com.example.CustomView');
  fixture.rootView.findViewById = javaMethod(() => customView);
  fixture.Java.cast = (value) => (value === customView ? fixture.button : value);
  await loadSdk(fixture);

  const visible = await fixture.context.AndroidExp.wait.ui(
    fixture.context.R.id.test_button,
    'visible',
  );

  assert.equal(visible.ok, true);
});

test('AndroidExp.input casts the display system service to DisplayManager', async () => {
  const fixture = createFixture();
  const ActivityThread = fixture.Java.use('android.app.ActivityThread');
  const application = ActivityThread.currentApplication();
  const originalGetSystemService = application.getSystemService;
  const displayService = javaObject('java.lang.Object');
  const display = javaObject('android.view.Display', {
    getRealSize: javaMethod((point) => {
      point.x.value = 1080;
      point.y.value = 1920;
    }),
  });
  const displayManager = javaObject('android.hardware.display.DisplayManager', {
    getDisplay: javaMethod(() => display),
  });
  application.getSystemService = javaMethod(function (name) {
    return name === 'display' ? displayService : originalGetSystemService.call(this, name);
  });
  let castClassName = null;
  fixture.Java.cast = (value, targetClass) => {
    if (value === displayService) {
      castClassName = targetClass.$className;
      return displayManager;
    }
    return value;
  };
  await loadSdk(fixture);

  const result = await fixture.context.AndroidExp.input.scroll({ x: 540, y: 960 }, 'up');

  assert.equal(result.ok, true);
  assert.equal(castClassName, 'android.hardware.display.DisplayManager');
});

test('AndroidExp.input reports each injection failure without retaining policy state', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  fixture.inputOverload.call = () => {
    throw new Error('java.lang.SecurityException: permission denied');
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await fixture.context.AndroidExp.input.click({ x: 10, y: 20 });
    assert.equal(result.error.code, 'PERMISSION_DENIED');
  }
});

test('AndroidExp.input returns structured validation failures', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);

  const invalidTap = await fixture.context.AndroidExp.input.click({ x: -1, y: 20 });
  const invalidText = await fixture.context.AndroidExp.input.input({ x: 10, y: 20 }, '');

  assert.equal(invalidTap.error.code, 'INVALID_COORDINATES');
  assert.equal(invalidText.error.code, 'INVALID_ARGUMENT');
});

test('withStateEvidence resolves action results and rethrows action failures asynchronously', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const lines = [];
  fixture.context.console = {
    log: (line) => lines.push(line),
    warn: () => {},
  };
  let count = 0;

  const resultPromise = fixture.context.Probe.evidence.withStateEvidence(
    () => {
      count += 1;
      return 'done';
    },
    'Increment count',
    {
      'Counter#count': () => count,
      'Broken#state': () => {
        throw new Error('unreadable');
      },
    },
  );

  assert.equal(typeof resultPromise.then, 'function');
  assert.equal(await resultPromise, 'done');
  const records = evidenceRecords(lines).filter((record) => record.category === 'state');
  assert.deepEqual(records.map((record) => record.payload.checkpoint), ['before', 'after']);
  assert.deepEqual(records.map((record) => record.payload.value), [0, 1]);
  assert.ok(records.every((record) => record.payload.actionDescription === 'Increment count'));

  const appError = new Error('action failed');
  await assert.rejects(
    () => fixture.context.Probe.evidence.withStateEvidence(
      () => { throw appError; },
      'Fail action',
      { state: () => count },
    ),
    (error) => error === appError,
  );
  assert.equal(evidenceRecords(lines).at(-1).payload.checkpoint, 'after');
});

test('withUiEvidence records keyed UI paths before and after an action', async () => {
  const fixture = createFixture();
  let mainThreadSchedules = 0;
  fixture.Java.scheduleOnMainThread = (work) => {
    mainThreadSchedules += 1;
    work();
  };
  await loadSdk(fixture);
  const lines = [];
  fixture.context.console = {
    log: (line) => lines.push(line),
    warn: () => {},
  };
  let exists = false;
  fixture.rootView.findViewById = javaMethod((id) => (
    id === fixture.context.R.id.test_button && exists ? fixture.button : null
  ));
  const resultPromise = fixture.context.Probe.evidence.withUiEvidence(
    () => {
      exists = true;
      return 7;
    },
    'Open dialog',
    {
      dialogButton: [`id::${fixture.context.R.id.test_button}`],
      missingButton: ['id::9999'],
    },
  );

  assert.equal(typeof resultPromise.then, 'function');
  assert.equal(await resultPromise, 7);
  assert.equal(mainThreadSchedules, 4);
  const records = evidenceRecords(lines).filter((record) => record.category === 'ui');
  const dialogRecords = records.filter((record) => record.payload.uiKey === 'dialogButton');
  const missingRecords = records.filter((record) => record.payload.uiKey === 'missingButton');
  assert.equal(records.length, 4);
  assert.ok(records.every((record) => !Object.hasOwn(record.payload, 'id')));
  assert.ok(records.every((record) => !Object.hasOwn(record.payload, 'path')));
  assert.equal(dialogRecords[0].payload.className, null);
  assert.equal(dialogRecords[0].payload.value.exist, false);
  assert.equal(dialogRecords[1].payload.value.exist, true);
  assert.equal(dialogRecords[1].payload.className, 'android.widget.Button');
  assert.deepEqual(dialogRecords[1].payload.value.bounds, {
    x: 100,
    y: 300,
    width: 200,
    height: 100,
  });
  assert.ok(missingRecords.every((record) => record.payload.value.exist === false));
  assert.ok(records.every((record) => (
    Object.hasOwn(record.payload.value, 'screenshots')
    && Object.keys(record.payload.value.screenshots).sort().join(',') === 'element,window'
  )));

  await assert.rejects(
    () => fixture.context.Probe.evidence.withUiEvidence(() => {}, 'Invalid UI', ['tag::dialog']),
    /uiTargets must be an object/,
  );
  await assert.rejects(
    () => fixture.context.Probe.evidence.withUiEvidence(() => {}, 'Invalid UI', {}),
    /uiTargets must not be empty/,
  );
  await assert.rejects(
    () => fixture.context.Probe.evidence.withUiEvidence(
      () => {},
      'Invalid UI',
      { invalid: ['class::android.view.View'] },
    ),
    /Invalid UI path/,
  );
});

test('withUiEvidence casts custom View wrappers while preserving their concrete class name', async () => {
  const fixture = createFixture();
  const customView = javaObject('com.example.ui.CustomIconView', {
    isAttachedToWindow: fixture.button.isAttachedToWindow,
    isShown: fixture.button.isShown,
    getWidth: fixture.button.getWidth,
    getHeight: fixture.button.getHeight,
    getLocationOnScreen: fixture.button.getLocationOnScreen,
  });
  fixture.rootView.findViewById = javaMethod(() => customView);
  fixture.Java.cast = (value) => value;
  await loadSdk(fixture);
  const lines = [];
  fixture.context.console = {
    log: (line) => lines.push(line),
    warn: () => {},
  };

  await fixture.context.Probe.evidence.withUiEvidence(
    () => {},
    'Observe custom view',
    { customIcon: [`id::${fixture.context.R.id.test_button}`] },
  );

  const records = evidenceRecords(lines).filter((record) => record.category === 'ui');
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.payload.className
    === 'com.example.ui.CustomIconView'));
  assert.ok(records.every((record) => record.payload.value.visible === true));
  assert.deepEqual(records[0].payload.value.bounds, {
    x: 100,
    y: 300,
    width: 200,
    height: 100,
  });
});

test('withUiEvidence captures a native UI path before and after the action', async () => {
  const fixture = createFixture();
  let visible = false;
  fixture.rootView.findViewWithTag = javaMethod((tag) => (
    String(tag) === 'dialog' && visible ? fixture.button : null
  ));
  await loadSdk(fixture);
  const lines = [];
  fixture.context.console = { log: (line) => lines.push(line), warn: () => {} };

  await fixture.context.Probe.evidence.withUiEvidence(
    () => { visible = true; },
    'Open tagged dialog',
    { dialog: ['tag::dialog'] },
  );

  const records = evidenceRecords(lines).filter((record) => record.category === 'ui');
  assert.equal(records.length, 2);
  assert.equal(records[0].payload.uiKey, 'dialog');
  assert.equal(records[0].payload.value.exist, false);
  assert.equal(records[1].payload.value.visible, true);
});

test('withChainEvidence filters fixed Log tags and business methods, then uninstalls hooks', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const lines = [];
  fixture.context.console = {
    log: (line) => lines.push(line),
    warn: () => {},
  };
  const businessOverload = overload(['java.lang.String'], (value) => `original:${value}`);
  const Business = javaClass('com.example.Business', {
    run: overloadedMethod([businessOverload]),
  });

  const result = await fixture.context.Probe.evidence.withChainEvidence(
    () => {
      fixture.emitNativeLog(3, 'IgnoredTag', 'ignored');
      fixture.emitNativeLog(4, 'SearchTag', 'opened');
      assert.equal(
        evidenceRecords(lines).some((record) => record.payload.message === 'opened'),
        true,
        'native log evidence must be emitted before the action returns',
      );
      businessOverload.implementation.call(null, 'skip');
      return businessOverload.implementation.call(null, 'match');
    },
    'Open search',
    new Set(['SearchTag']),
    [{
      target: Business,
      method: 'run',
      filter: (invocation) => String(invocation.args[0]) === 'match',
    }],
  );

  assert.equal(result, 'original:match');
  assert.equal(fixture.logOverload.implementation, null);
  assert.equal(fixture.nativeLogListeners.length, 0);
  assert.equal(businessOverload.implementation, null);
  const records = evidenceRecords(lines).filter((record) => record.category === 'chain');
  assert.deepEqual(records.map((record) => record.payload.type), ['log', 'method', 'method']);
  assert.deepEqual(records.map((record) => record.payload.phase ?? null), [null, 'enter', 'leave']);
  assert.ok(records.every((record) => record.payload.actionDescription === 'Open search'));
  assert.equal(records[0].payload.level, 'i');

  const appError = new Error('action failed');
  await assert.rejects(
    () => fixture.context.Probe.evidence.withChainEvidence(
      () => { throw appError; },
      'Fail chain',
      'SearchTag',
    ),
    (error) => error === appError,
  );
  assert.equal(fixture.logOverload.implementation, null);
  assert.equal(fixture.nativeLogListeners.length, 0);
});

test('withChainEvidence keeps hooks until a Promise action settles', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  let resolveAction;
  const actionResult = new Promise((resolve) => {
    resolveAction = resolve;
  });

  const result = fixture.context.Probe.evidence.withChainEvidence(
    () => actionResult,
    'Async search',
    'SearchTag',
  );

  assert.equal(typeof result.then, 'function');
  assert.equal(fixture.nativeLogListeners.length, 1);
  resolveAction('done');
  assert.equal(await result, 'done');
  assert.equal(fixture.logOverload.implementation, null);
  assert.equal(fixture.nativeLogListeners.length, 0);
});

test('withChainEvidence rolls back earlier hooks when a later hook cannot install', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  let actionCalled = false;

  await assert.rejects(
    () => fixture.context.Probe.evidence.withChainEvidence(
      () => {
        actionCalled = true;
      },
      'Invalid setup',
      'SearchTag',
      [{ target: fixture.context.Java.use('android.util.Log'), method: 'missing' }],
    ),
    /Java method not found/,
  );

  assert.equal(actionCalled, false);
  assert.equal(fixture.logOverload.implementation, null);
  assert.equal(fixture.nativeLogListeners.length, 0);
});

test('withChainEvidence installs one native listener per TAG and passes TAG as listener data', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const lines = [];
  fixture.context.console = { log: (line) => lines.push(line), warn: () => {} };

  await fixture.context.Probe.evidence.withChainEvidence(
    () => {
      assert.deepEqual(
        fixture.nativeLogListeners.map((listener) => listener.data.value).sort(),
        ['Auth', 'Network'],
      );
      assert.ok(fixture.nativeLogListeners.every(
        (listener) => listener.target.symbol === '__android_log_write_log_message',
      ));
      fixture.emitNativeLog(5, 'Auth', 'authentication warning');
      fixture.emitNativeLog(6, 'Network', 'request failed');
      fixture.emitNativeLog(3, 'Other', 'ignored');
    },
    'Submit login',
    new Set(['Network', 'Auth', 'Auth']),
  );

  const records = evidenceRecords(lines).filter((record) => record.category === 'chain');
  assert.deepEqual(records.map((record) => record.payload), [
    {
      type: 'log',
      actionDescription: 'Submit login',
      level: 'w',
      tag: 'Auth',
      message: 'authentication warning',
    },
    {
      type: 'log',
      actionDescription: 'Submit login',
      level: 'e',
      tag: 'Network',
      message: 'request failed',
    },
  ]);
  assert.equal(fixture.nativeLogListeners.length, 0);
});

test('withChainEvidence compiles the native filter once and reuses immutable TAG data', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  let firstTagPointer;
  let secondTagPointer;

  await fixture.context.Probe.evidence.withChainEvidence(
    () => { firstTagPointer = fixture.nativeLogListeners[0].data; },
    'First action',
    'Search',
  );
  await fixture.context.Probe.evidence.withChainEvidence(
    () => { secondTagPointer = fixture.nativeLogListeners[0].data; },
    'Second action',
    'Search',
  );

  assert.equal(fixture.getCModuleCompileCount(), 1);
  assert.equal(secondTagPointer, firstTagPointer);
});

test('withChainEvidence falls back to __android_log_buf_write when modern liblog is unavailable', async () => {
  const fixture = createFixture({ modernLogSymbol: false });
  await loadSdk(fixture);

  await fixture.context.Probe.evidence.withChainEvidence(
    () => {
      assert.equal(
        fixture.nativeLogListeners[0].target.symbol,
        '__android_log_buf_write',
      );
    },
    'Legacy action',
    'Legacy',
  );
});

test('Override.run replaces matching Android returns and restores the method', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  let originalCalls = 0;
  const regionOverload = overload(['java.lang.String'], (scene) => {
    originalCalls += 1;
    return `original:${scene}`;
  });
  const RegionProvider = javaClass('com.example.RegionProvider', {
    getRegion: overloadedMethod([regionOverload]),
  });
  const receiver = javaObject('com.example.RegionProvider');

  const result = fixture.context.Override.run(
    [{
      target: RegionProvider,
      method: 'getRegion',
      argumentTypes: ['java.lang.String'],
      filter: (invocation) => String(invocation.args[0]) === 'search',
      withReturn: 'JP',
    }],
    () => ({
      search: regionOverload.implementation.call(receiver, 'search'),
      feed: regionOverload.implementation.call(receiver, 'feed'),
    }),
  );

  assert.deepEqual(result, { search: 'JP', feed: 'original:feed' });
  assert.equal(originalCalls, 1);
  assert.equal(regionOverload.implementation, null);
});

test('Override.run protects Android callbacks and keeps overrides through Promise settlement', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const regionOverload = overload([], () => 'US');
  const RegionProvider = javaClass('com.example.RegionProvider', {
    getRegion: overloadedMethod([regionOverload]),
  });
  let resolveAction;

  const result = fixture.context.Override.run(
    [{
      target: RegionProvider,
      method: 'getRegion',
      withReturn() {
        throw new Error('replacement failed');
      },
    }],
    () => new Promise((resolve) => {
      resolveAction = () => resolve(regionOverload.implementation.call(null));
    }),
  );

  assert.equal(typeof regionOverload.implementation, 'function');
  resolveAction();
  assert.equal(await result, 'US');
  assert.equal(regionOverload.implementation, null);
  assert.equal(
    fixture.sentEvents.some((event) => event.channel === 'override.callback_error'
      && event.payload.phase === 'withReturn'),
    true,
  );
});

test('Override.run calls a throwing Android original only once after filter rejection', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  let originalCalls = 0;
  const appError = new Error('app failed');
  const regionOverload = overload([], () => {
    originalCalls += 1;
    throw appError;
  });
  const RegionProvider = javaClass('com.example.RegionProvider', {
    getRegion: overloadedMethod([regionOverload]),
  });

  assert.throws(
    () => fixture.context.Override.run(
      [{
        target: RegionProvider,
        method: 'getRegion',
        filter: () => false,
        withReturn: 'JP',
      }],
      () => regionOverload.implementation.call(null),
    ),
    (error) => error === appError,
  );
  assert.equal(originalCalls, 1);
  assert.equal(regionOverload.implementation, null);
});

test('Override.run rolls back Android definitions when installation fails', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const regionOverload = overload([], () => 'US');
  const RegionProvider = javaClass('com.example.RegionProvider', {
    getRegion: overloadedMethod([regionOverload]),
  });
  let actionCalled = false;

  assert.throws(
    () => fixture.context.Override.run(
      [
        { target: RegionProvider, method: 'getRegion', withReturn: 'JP' },
        { target: RegionProvider, method: 'missing', withReturn: 'JP' },
      ],
      () => { actionCalled = true; },
    ),
    /Java method not found/,
  );
  assert.equal(actionCalled, false);
  assert.equal(regionOverload.implementation, null);
});

test('evidence preserves ordinary payloads', async () => {
  const fixture = createFixture();
  await loadSdk(fixture);
  const payload = { text: 'probe state', nested: { visible: true } };

  const lines = [];
  fixture.context.console = { log: (line) => lines.push(line), warn: () => {} };
  fixture.context.Probe.evidence.withStateEvidence(
    () => {},
    'Record payload',
    { payload: () => payload },
  );
  const record = evidenceRecords(lines)[0];
  assert.deepEqual(record.payload.value, payload);
});

function createFixture({ modernLogSymbol = true, screenshotArtifactRecords = [] } = {}) {
  const sentEvents = [];
  const screenshotReceivers = new Map();
  const injectedEvents = [];
  const nativeLogListeners = [];
  let cModuleCompileCount = 0;
  let uptime = 1000;
  const mainLooper = javaObject('android.os.Looper', {
    getThread: javaMethod(() => javaObject('java.lang.Thread', {
      getName: javaMethod(() => 'main'),
    })),
  });
  const button = javaObject('android.widget.Button', {
    getLocationOnScreen: javaMethod((location) => {
      location[0] = 100;
      location[1] = 300;
    }),
    getWidth: javaMethod(() => 200),
    getHeight: javaMethod(() => 100),
    isAttachedToWindow: javaMethod(() => true),
    isShown: javaMethod(() => true),
  });
  const listenerInterface = javaClass('android.view.View$OnClickListener', {});
  listenerInterface.class = {
    isInterface: () => true,
    getMethods: () => [reflectionMethod('onClick', ['android.view.View'])],
  };
  button.setOnClickListener = overloadedMethod([
    overload(['android.view.View$OnClickListener'], function (listener) {
      this.listener = listener;
    }),
  ]);
  button.performClick = javaMethod(function () {
    this.listener?.onClick(this);
    return true;
  });

  const activity = javaObject('android.app.Activity', {
    findViewById: javaMethod((id) => (id === 1001 ? button : null)),
    isFinishing: javaMethod(() => false),
    isDestroyed: javaMethod(() => false),
    hasWindowFocus: javaMethod(() => true),
    getWindow: javaMethod(() => javaObject('android.view.Window')),
  });
  const record = javaObject('android.app.ActivityThread$ActivityClientRecord', {
    activity: { value: activity },
    paused: { value: false },
    stopped: { value: false },
  });
  const records = javaObject('java.util.Map', {
    values: javaMethod(() => javaCollection([record])),
  });
  const activityThread = javaObject('android.app.ActivityThread', {
    mActivities: { value: records },
  });
  const resources = javaObject('android.content.res.Resources', {
    getIdentifier: javaMethod((name, type) => (name === 'test_button' && type === 'id' ? 1001 : 0)),
    getResourceEntryName: javaMethod((id) => {
      if (id === 1001) return 'test_button';
      if (id === 2002) return 'background_button';
      throw new Error(`resource not found: ${id}`);
    }),
  });
  const inputOverload = overload(['android.view.InputEvent', 'int'], (_event, _mode) => true);
  inputOverload.call = (_receiver, event, mode) => {
    injectedEvents.push({
      action: event.action,
      x: event.x,
      y: event.y,
      keyCode: event.keyCode,
      displayId: event.displayId,
      mode,
    });
    return true;
  };
  const inputManager = javaObject('android.hardware.input.InputManager', {
    injectInputEvent: overloadedMethod([inputOverload]),
  });
  const display = javaObject('android.view.Display', {
    getRealSize: javaMethod((point) => {
      point.x.value = 1080;
      point.y.value = 1920;
    }),
  });
  const displayManager = javaObject('android.hardware.display.DisplayManager', {
    getDisplay: javaMethod((displayId) => (displayId === 0 ? display : null)),
  });
  const application = javaObject('android.app.Application', {
    getPackageName: javaMethod(() => 'com.example'),
    getResources: javaMethod(() => resources),
    getClassLoader: javaMethod(() => javaObject('java.lang.ClassLoader')),
    getSystemService: javaMethod((name) => {
      if (name === 'input') {
        return inputManager;
      }
      return name === 'display' ? displayManager : null;
    }),
    registerActivityLifecycleCallbacks: javaMethod(function (tracker) {
      this.tracker = tracker;
    }),
    unregisterActivityLifecycleCallbacks: javaMethod(function () {
      this.tracker = null;
    }),
  });
  const rootView = javaObject('android.view.View', {
    hasWindowFocus: javaMethod(() => true),
    findViewById: javaMethod((id) => (id === 1001 ? button : null)),
  });
  const backgroundRootView = javaObject('android.view.View', {
    hasWindowFocus: javaMethod(() => false),
    findViewById: javaMethod((id) => (id === 2002 ? button : null)),
  });
  const modifier = javaClass('java.lang.reflect.Modifier', {
    isAbstract: javaMethod(() => true),
  });
  const logOverload = overload(['java.lang.String', 'java.lang.String'], () => 1);
  const Log = javaClass('android.util.Log', {
    d: overloadedMethod([logOverload]),
  });
  const MotionEvent = javaClass('android.view.MotionEvent', {
    obtain: javaMethod((_downTime, _eventTime, action, x, y) => javaObject('android.view.MotionEvent', {
      action,
      x,
      y,
      setSource: javaMethod(function (source) {
        this.source = source;
      }),
      setDisplayId: javaMethod(function (displayId) {
        this.displayId = displayId;
      }),
      recycle: javaMethod(() => {}),
    })),
  });
  const KeyEvent = javaClass('android.view.KeyEvent', {
    $new: (_downTime, _eventTime, action, keyCode) => javaObject('android.view.KeyEvent', {
      action,
      keyCode,
      setDisplayId: javaMethod(function (displayId) {
        this.displayId = displayId;
      }),
      recycle: javaMethod(() => {}),
    }),
  });
  const createTextKeyEvents = (characters) => Array.from(characters).flatMap((character) => {
    const keyCode = character.codePointAt(0);
    return [KeyEvent.$new(uptime, uptime, 0, keyCode), KeyEvent.$new(uptime, uptime, 1, keyCode)];
  });
  const screenshotArtifactMaps = screenshotArtifactRecords.map((record) => javaObject(
    'java.util.Map',
    { get: javaMethod((key) => record[key] ?? null) },
  ));
  const screenshotArtifacts = javaObject('java.util.ArrayList', {
    size: javaMethod(() => screenshotArtifactMaps.length),
    get: javaMethod((index) => screenshotArtifactMaps[index]),
  });
  const screenshotResult = javaObject('java.util.Map', {
    get: javaMethod((key) => ({
      ok: true,
      captureMethod: 'view-draw',
      artifacts: screenshotArtifacts,
    })[key] ?? null),
  });
  const classes = new Map([
    ['android.app.ActivityThread', javaClass('android.app.ActivityThread', {
      currentActivityThread: javaMethod(() => activityThread),
      currentApplication: javaMethod(() => application),
      currentProcessName: javaMethod(() => 'com.example'),
    })],
    ['android.app.Application$ActivityLifecycleCallbacks', javaClass('android.app.Application$ActivityLifecycleCallbacks')],
    ['android.os.Looper', javaClass('android.os.Looper', {
      getMainLooper: javaMethod(() => mainLooper),
    })],
    ['android.os.SystemClock', javaClass('android.os.SystemClock', {
      uptimeMillis: javaMethod(() => {
        uptime += 1;
        return uptime;
      }),
    })],
    ['android.view.InputDevice', javaClass('android.view.InputDevice', {
      SOURCE_TOUCHSCREEN: { value: 4098 },
    })],
    ['android.view.View', javaClass('android.view.View', {
      class: {
        isInterface: () => false,
        isInstance: (value) => value !== activity,
      },
      FIND_VIEWS_WITH_TEXT: { value: 1 },
    })],
    ['android.view.ViewGroup', javaClass('android.view.ViewGroup')],
    ['android.widget.TextView', javaClass('android.widget.TextView')],
    ['android.widget.Button', javaClass('android.widget.Button')],
    ['com.example.CustomView', javaClass('com.example.CustomView')],
    ['com.example.ui.CustomIconView', javaClass('com.example.ui.CustomIconView')],
    ['java.lang.String', javaClass('java.lang.String', {
      $new: (value) => String(value),
    })],
    ['java.util.ArrayList', javaClass('java.util.ArrayList', {
      $new: () => {
        const values = [];
        return javaObject('java.util.ArrayList', {
          add: javaMethod((value) => {
            values.push(value);
            return true;
          }),
          toArray: javaMethod(() => values),
        });
      },
    })],
    ['java.util.LinkedHashMap', javaClass('java.util.LinkedHashMap', {
      $new: () => javaObject('java.util.LinkedHashMap', {
        put: javaMethod(() => null),
      }),
    })],
    ['java.util.Map', javaClass('java.util.Map')],
    ['java.util.List', javaClass('java.util.List')],
    ['com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot$ScreenshotCallback', javaClass(
      'com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot$ScreenshotCallback',
    )],
    ['com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot', javaClass(
      'com.agenteasyuse.mobileeasyuse.internal.MEUScreenshot',
      {
        captureAsync: javaMethod((requestId, _root, _targets, _includeWindow, _quality, callback) => {
          callback.onComplete(requestId, screenshotResult);
        }),
        artifactDataBase64: javaMethod(() => '/9j/2Q=='),
      },
    )],
    ['android.hardware.display.DisplayManager', javaClass('android.hardware.display.DisplayManager')],
    ['android.hardware.input.InputManager', javaClass('android.hardware.input.InputManager')],
    ['android.graphics.Point', javaClass('android.graphics.Point', {
      $new: () => javaObject('android.graphics.Point', { x: { value: 0 }, y: { value: 0 } }),
    })],
    ['android.view.MotionEvent', MotionEvent],
    ['android.view.KeyEvent', KeyEvent],
    ['android.view.KeyCharacterMap', javaClass('android.view.KeyCharacterMap', {
      load: javaMethod(() => javaObject('android.view.KeyCharacterMap', {
        getEvents: javaMethod((characters) => createTextKeyEvents(characters)),
      })),
    })],
    ['android.view.WindowManagerGlobal', javaClass('android.view.WindowManagerGlobal', {
      getInstance: javaMethod(() => javaObject('android.view.WindowManagerGlobal', {
        getRootViews: javaMethod(() => javaCollection([rootView, backgroundRootView])),
      })),
    })],
    ['android.view.ViewRootImpl', javaClass('android.view.ViewRootImpl')],
    ['android.view.View$OnClickListener', listenerInterface],
    ['android.util.Log', Log],
    ['java.lang.reflect.Modifier', modifier],
  ]);
  const Java = {
    available: true,
    performNow: (work) => {
      work();
    },
    scheduleOnMainThread: (work) => work(),
    use: (name) => {
      if (!classes.has(name)) {
        throw new Error(`class not found: ${name}`);
      }
      return classes.get(name);
    },
    registerClass: ({ methods }) => ({
      $new: () => javaObject('generated.Callback', methods),
    }),
    retain: (value) => value,
    array: (_type, values) => values,
    cast: (value) => value,
  };
  const nativePointer = (value) => ({
    value,
    isNull: () => value === null,
    readUtf8String: () => value,
  });
  function NativeCallback(callback) {
    return callback;
  }
  class CModule {
    constructor(source, symbols) {
      cModuleCompileCount += 1;
      this.source = source;
      this.symbols = symbols;
      this.on_enter_message = { module: this, name: 'on_enter_message' };
      this.on_enter_buf_write = { module: this, name: 'on_enter_buf_write' };
    }
  }
  const modernNativeLogTarget = {
    module: 'liblog.so',
    symbol: '__android_log_write_log_message',
  };
  const legacyNativeLogTarget = {
    module: 'liblog.so',
    symbol: '__android_log_buf_write',
  };
  const Interceptor = {
    attach(target, callback, data) {
      assert.ok(target === modernNativeLogTarget || target === legacyNativeLogTarget);
      const listener = {
        callback,
        data,
        target,
        detach() {
          const index = nativeLogListeners.indexOf(listener);
          if (index !== -1) {
            nativeLogListeners.splice(index, 1);
          }
        },
      };
      nativeLogListeners.push(listener);
      return listener;
    },
  };
  const emitNativeLog = (priority, tag, message) => {
    for (const listener of [...nativeLogListeners]) {
      if (listener.data.value === tag) {
        listener.callback.module.symbols.on_matched_log(
          priority,
          nativePointer(tag),
          nativePointer(message),
        );
      }
    }
  };
  const context = vm.createContext({
    Process: {
      id: 123,
      getModuleByName(name) {
        assert.equal(name, 'liblog.so');
        return {
          findExportByName(symbol) {
            assert.equal(symbol, '__android_log_write_log_message');
            return modernLogSymbol ? modernNativeLogTarget : null;
          },
          getExportByName(symbol) {
            assert.equal(symbol, '__android_log_buf_write');
            return legacyNativeLogTarget;
          },
        };
      },
    },
    Interceptor,
    CModule,
    NativeCallback,
    Memory: {
      allocUtf8String: nativePointer,
    },
    recv: (type, callback) => {
      screenshotReceivers.set(type, callback);
      return { wait() {} };
    },
    send: (event) => {
      sentEvents.push(event);
      const requestId = event?.payload?.requestId;
      if (typeof requestId !== 'string') return;
      const replyType = `mobile-easy-use.controller.response.${requestId}`;
      const callback = screenshotReceivers.get(replyType);
      screenshotReceivers.delete(replyType);
      callback?.({
        type: replyType,
        payload: {
          ok: true,
          responsePayload: {
            filePath: `/host/${event.payload.payload.filePath}`,
          },
        },
      });
    },
    console,
    Date,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    Proxy,
    Reflect,
    Boolean,
    Number,
    String,
    Error,
    Promise,
    Math,
    setTimeout,
    clearTimeout,
    rpc: {},
    Script: {
      load: async () => {
        throw new Error('Script.load is not expected in Android SDK unit tests');
      },
    },
  });
  return {
    context,
    Java,
    activity,
    button,
    logOverload,
    Log,
    Looper: classes.get('android.os.Looper'),
    mainLooper,
    rootView,
    sentEvents,
    inputOverload,
    injectedEvents,
    emitNativeLog,
    getCModuleCompileCount: () => cModuleCompileCount,
    nativeLogListeners,
  };
}

function evidenceRecords(lines) {
  const prefix = '@@MOBILE_EVIDENCE@@';
  return lines
    .filter((line) => typeof line === 'string' && line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)));
}

function javaClass(className, members = {}) {
  return {
    $className: className,
    class: { isInterface: () => false },
    ...members,
  };
}

function javaObject(className, members = {}) {
  return {
    $className: className,
    getClass: () => reflectionClass(className),
    toString: () => `${className}@fixture`,
    ...members,
  };
}

function javaMethod(implementation) {
  return function (...args) {
    return implementation.apply(this, args);
  };
}

function overload(argumentTypes, implementation) {
  return {
    argumentTypes: argumentTypes.map((className) => ({ className })),
    returnType: { className: 'void' },
    call(receiver, ...args) {
      return implementation.apply(receiver, args);
    },
    implementation: null,
  };
}

function overloadedMethod(overloads) {
  const method = function (...args) {
    return overloads[0].call(this, ...args);
  };
  method.overloads = overloads;
  method.overload = (...types) => overloads.find(
    (candidate) => candidate.argumentTypes.map((type) => type.className).join(',') === types.join(','),
  );
  return method;
}

function javaCollection(values) {
  return {
    toArray: () => values,
  };
}

function reflectionClass(className) {
  return {
    getName: () => className,
    getClassLoader: () => javaObject('java.lang.ClassLoader'),
    getDeclaredField: () => {
      throw new Error('missing field');
    },
    getSuperclass: () => null,
  };
}

function reflectionMethod(name, parameterTypes, returnType = 'void') {
  return {
    getName: () => name,
    getModifiers: () => 1,
    getDeclaringClass: () => ({ getName: () => 'android.view.View$OnClickListener' }),
    getParameterTypes: () => parameterTypes.map((className) => ({ getName: () => className })),
    getReturnType: () => ({ getName: () => returnType }),
  };
}
