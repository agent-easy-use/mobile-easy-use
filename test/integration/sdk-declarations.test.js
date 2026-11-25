import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
// Use the same bundled TypeScript and standard library as the SDK compiler.
import ts from 'frida-compile/ext/typescript.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lib = fileURLToPath(import.meta.resolve('frida-compile/ext/lib.es2022.d.ts'));

function check(platform, source) {
  const declaration = path.join(root, `sdk/${platform}/index.d.ts`);
  const input = path.join(root, `sdk/${platform}/declaration-check.ts`);
  const readFile = (name) => {
    if (name === input) return source;
    try { return fs.readFileSync(name, 'utf8'); } catch { return undefined; }
  };
  const host = {
    getSourceFile(name, version) {
      const text = readFile(name);
      return text === undefined ? undefined : ts.createSourceFile(name, text, version, true);
    },
    getDefaultLibFileName: () => lib,
    writeFile() {},
    getCurrentDirectory: () => root,
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: name => name === input || fs.existsSync(name),
    readFile,
  };
  const program = ts.createProgram([declaration, input], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ['frida-gum'],
    lib: [lib],
  }, host);
  assert.equal(ts.formatDiagnostics(ts.getPreEmitDiagnostics(program), host), '');
}

for (const platform of ['android', 'ios']) {
  test(`${platform} public APIs compile and reject invalid calls`, () => {
    const android = platform === 'android';
    const prefix = android ? 'Android' : 'IOS';
    const definition = android
      ? "{ className: 'Flags', method: 'enabled', argumentTypes: [] }"
      : "{ className: 'Flags', selector: '- enabled' }";
    const target = android ? 'R.id.submit' : "'submit'";
    const instance = android ? "Java.use('Flags').$new()" : 'ObjC.classes.Flags.alloc().init()';
    const field = android ? "{ instance, field: 'enabled' }" : "{ instance, property: 'enabled' }";
    check(platform, `export {};
      const platform: '${platform}' = runtimeStatus().platform;
      const target = ${target};
      const { expect } = Test.create();
      expect(await inspect.ui.isFocused(target)).toBe(true);
      // @ts-expect-error UI observation belongs to inspect.ui
      expect(target).toExist();
      // @ts-expect-error UI observation belongs to inspect.ui
      expect(target).toBeVisible();
      // @ts-expect-error UI observation belongs to inspect.ui
      expect(target).toBeHidden();
      // @ts-expect-error UI observation belongs to inspect.ui
      expect(target).toBeFocused();
      // @ts-expect-error UI observation belongs to inspect.ui
      expect(target).toBeEnabled();
      // @ts-expect-error UI observation belongs to inspect.ui
      expect(target).toSatisfy(() => true);
      const view = await element.findUiView(target);
      if (view) await drive.click(view);
      await drive.click({ x: 1, y: 2 });
      await drive.input(target, 'hello');
      await drive.longPress(target);
      await drive.scroll(target, 'up');
      await drive.wait(target, 'visible');
      await drive.waitUntil(async () => true);
      const mainValue: number = await common.runOnMainThread(() => 42);
      const thread: string | null = common.currentThreadName();
      const definition: ${prefix}MethodDefinition = ${definition};
      const installation: Promise<() => Promise<void>> = override.method(definition, ${android ? 'true' : '1'});
      const remove = await installation;
      const removed: Promise<void> = remove();
      const instance${android ? ': Java.Wrapper' : ''} = ${instance};
      const removeField: () => Promise<void> = await override.field(${field}, 1);
      await removeField();
      const logs = await inspect.log.watch(['ApiDemo']);
      const records: ${prefix}InspectResult<${prefix}LogRecord> = await logs.current();
      await logs.stop();
      const methods = await inspect.method.watch(definition, {
        stack: 5, enter: ({ receiver, args }) => ({ receiver, args }),
        leave: ({ result, exception }) => ({ result, exception }),
      });
      await methods.current();
      await methods.stop();
      // @ts-expect-error action-scoped overrides are no longer an entry point
      override.run([], () => {});
      // @ts-expect-error legacy types must not suggest a second override contract
      const legacy: ${prefix}OverrideApi = {};
      // @ts-expect-error installation must be awaited before removal
      installation();
      // @ts-expect-error method definitions use className
      override.method({ target: 'Flags', ${android ? "method: 'enabled'" : "selector: '- enabled'"} }, 1);
      // @ts-expect-error stack is a frame count
      inspect.method.watch(definition, { stack: true });
      // @ts-expect-error UI paths must not be empty
      element.findUiView([]);
      // @ts-expect-error waits do not accept screen coordinates
      drive.wait({ x: 1, y: 2 }, 'visible');
      // @ts-expect-error watcher results must be awaited
      const synchronous: ${prefix}InspectResult<${prefix}LogRecord> = logs.current();
      ${android ? `
      await override.field({ className: 'Flags', field: 'enabled' }, true);
      // @ts-expect-error className and instance are mutually exclusive
      override.field({ className: 'Flags', instance, field: 'enabled' }, true);
      ` : `
      common.findClass('Flags', ['- enabled']);
      const unknownLevel: IOSLogRecord['level'] = null;
      const swiftAvailable: boolean = Swift.available;
      // @ts-expect-error iOS gesture duration is fixed
      drive.longPress(target, 800);
      // @ts-expect-error iOS gesture distance is fixed
      drive.scroll(target, 'up', 500);
      // @ts-expect-error the IOS namespace was removed
      IOS.input.click(target);
      // @ts-expect-error iOS properties require an instance
      override.field({ className: 'Flags', property: 'enabled' }, 1);
      // @ts-expect-error selectors must declare instance or class method
      override.method({ className: 'Flags', selector: 'enabled' }, 1);
      `}
    `);
  });
}

for (const [platform, prefix] of [['android', 'Android'], ['ios', 'IOS']]) {
  test(`${platform} inspect screenshot signatures distinguish element and window captures`, () => {
    check(platform, `export {};
      declare const ui: ${prefix}InspectUiApi;
      declare const target: ${prefix}InspectUiTarget;
      const element: ${prefix}UIScreenshot = await ui.screenshotElement(target);
      const window: ${prefix}UIScreenshot = await ui.screenshotWindow();
      const marked: ${prefix}UIScreenshot = await ui.screenshotElementInWindow(target, false);
      // @ts-expect-error the ambiguous screenshot method was removed
      ui.screenshot(target);
      // @ts-expect-error an element target is required
      ui.screenshotElement();
      // @ts-expect-error window capture does not accept a target
      ui.screenshotWindow(target);
      // @ts-expect-error highlight must be boolean
      ui.screenshotElementInWindow(target, 1);
    `);
  });
}
