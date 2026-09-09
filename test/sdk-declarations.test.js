import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
// Use the same bundled TypeScript and standard library as the SDK compiler.
import ts from 'frida-compile/ext/typescript.js';

const root = fileURLToPath(new URL('../', import.meta.url));
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
  test(`${platform} declarations and JSDoc method examples compile without skipLibCheck`, () => {
    const declarations = fs.readFileSync(path.join(root, `sdk/${platform}/index.d.ts`), 'utf8');
    const examples = [...declarations.matchAll(/@example (.+)/g)]
      .map(([, example]) => example)
      // Object-property fragments document hook capture options, not standalone statements.
      .filter(example => !/^(stack|capture):/.test(example));
    assert.ok(examples.length >= 14);
    check(platform, `export {};\ndeclare const cacheReady: boolean;\n`
      + (platform === 'android' ? 'declare const view: Java.Wrapper | null;\n' : '')
      + examples.map((example, index) => `async function example${index}() { ${example} }`).join('\n'));
  });
}

test('Android generation contract accepts supported targets and rejects misleading shapes', () => {
  check('android', `export {};
    const platform: 'android' = runtimeStatus().platform;
    const path = ['text::Submit'] as const;
    const hook: ProbeChainMethodHook = {
      target: 'Flags', method: 'enabled', argumentTypes: [] as const,
      capture: { args: call => call.argumentTypes, timing: true, memory: { metrics: ['javaHeapUsedBytes'] } },
    };
    for (const target of [R.id.submit, path, Java.use('android.view.View').$new(), {x: 1, y: 2}] as const) {
      await AndroidExp.input.click(target);
      await AndroidExp.input.longPress(target);
      await AndroidExp.input.input(target, 'hello');
      await AndroidExp.input.scroll(target, 'up');
    }
    const shot = await AndroidExp.screenshot();
    if (shot.ok) {
      const maybePath: string | undefined = shot.targets.missing;
      // @ts-expect-error a successful screenshot can omit a target
      const alwaysPath: string = shot.targets.missing;
    }
    const value: Promise<number> = Override.run([
      { target: 'Flags', method: 'enabled', withReturn: true },
      { target: 'Flags', method: 'name', withReturn: 'test' },
      { target: 'Flags', method: 'count', withReturn: int64('42') },
    ], async () => 42);
    const observed: number = await Probe.evidence.withChainEvidence(() => 42, 'Read', undefined, [hook]);
    // @ts-expect-error empty UI paths are invalid
    AndroidExp.ui.find([]);
    // @ts-expect-error coordinates are input targets, not wait targets
    AndroidExp.wait.ui({x: 1, y: 2}, 'visible');
    // @ts-expect-error UI evidence requires paths, not resource IDs
    Probe.evidence.withUiEvidence(() => 1, 'Read', { submit: R.id.submit });
    // @ts-expect-error predicates are synchronous
    AndroidExp.wait.until(async () => true);
    // @ts-expect-error Android long press has no duration parameter
    AndroidExp.input.longPress(R.id.submit, 800);
    // @ts-expect-error arbitrary JSON objects do not become Java return values
    const invalid: AndroidOverrideReturnValue = { enabled: true };
  `);
});

test('iOS generation contract narrows actions and requires native override return values', () => {
  check('ios', `export {};
    const platform: 'ios' = runtimeStatus().platform;
    const clicked = await IOS.input.click('submit');
    const action: 'click' = clicked.action;
    const entered = await IOS.input.input('query', 'hello');
    if (entered.ok) { const count: number = entered.textLength; }
    const scrolled = await IOS.input.scroll(['identifier::list'], 'up');
    if (scrolled.ok) { const x: number = scrolled.startX; const distance: number = scrolled.distance; }
    const input: IOSInputResult = scrolled;
    if (input.ok && input.action === 'scroll') { const x: number = input.startX; }
    const view = IOS.ui.find('submit');
    if (view) await IOS.input.click(view);
    const shot = await IOS.screenshot();
    if (shot.ok) {
      // @ts-expect-error a successful screenshot can omit a target
      const alwaysPath: string = shot.targets.missing;
    }
    const result: Promise<number> = Override.run([
      { target: 'Flags', selector: '+ enabled', withReturn: true },
      { target: 'Flags', selector: '+ name', withReturn: ObjC.classes.NSString.stringWithString_('test') },
      { target: 'Flags', selector: '+ object', withReturn: NULL },
      { target: 'Flags', selector: '+ count', withReturn: uint64('42') },
    ], async () => 42);
    // @ts-expect-error raw JS strings are not Objective-C object returns
    const rawString: IOSOverrideReturnValue = 'test';
    // @ts-expect-error use NULL for a nil native return
    const rawNull: IOSOverrideReturnValue = null;
    // @ts-expect-error arbitrary JSON is not a native return value
    const rawObject: IOSOverrideReturnValue = { enabled: true };
    // @ts-expect-error exact selector prefix is required
    const hook: IOSMethodHook = { target: 'Flags', selector: 'enabled' };
    // @ts-expect-error UIView instances are not wait targets
    IOS.wait.ui(view!, 'visible');
    // @ts-expect-error UIView instances are not screenshot targets
    IOS.screenshot({ targets: { submit: view! } });
    // @ts-expect-error JS getter paths are unsupported
    IOS.ui.find([root => root]);
    Probe.evidence.withStateEvidence(() => 1, 'Read', { value: async () => 1 });
  `);
});
