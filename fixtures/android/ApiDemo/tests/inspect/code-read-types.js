import Java from 'frida-java-bridge';
import source from '../../app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/DebuggerReadTypesFixture.java';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const className = 'com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerReadTypesFixture';
const names = ['flag', 'tiny', 'letter', 'small', 'number', 'wide', 'single', 'fraction',
  'text', 'box', 'nil', 'boxed', 'flags', 'bytes', 'chars', 'shorts', 'ints', 'longs',
  'floats', 'doubles', 'texts', 'matrix', 'empty', 'nullArray'];
const expectedArrays = {
  flags: ['true', 'false'], bytes: ['-128', '127'], chars: ['中', 'A'], shorts: ['-32768', '32767'],
  ints: ['-2147483648', '2147483647'], longs: ['-9223372036854775808', '9007199254740993', '9223372036854775807'],
  floats: ['1.25', '-0', 'NaN', 'Infinity'], doubles: ['-2.5', '-0', 'NaN', '-Infinity'],
  texts: ['你好', null, ''], matrix: [['1', '2'], [], ['-3']], empty: [],
};
// Preserve wide integers and special floats without routing through JSON or legacy snapshot serialization.
function contents(array) {
  return Array.from({ length: array.length }, (_, index) => {
    const item = array[index];
    if (item === null) return null;
    if (Array.isArray(item) || (item.$h && item.length !== undefined)) return contents(item);
    return Object.is(item, -0) ? '-0' : String(item);
  });
}
let watcher;
describe('inspect.code native read types', () => {
  afterEach(async () => { if (watcher) await watcher.stop(); watcher = undefined; });
  for (const instance of [false, true]) {
    for (const kind of ['argument', 'local']) {
      test(`${instance ? 'instance' : 'static'} method reads ${kind} primitive, object and array boundaries`, async () => {
        const marker = instance ? 'BP_READ_INSTANCE' : 'BP_READ_STATIC';
        const lines = source.split('\n').flatMap((line, index) => line.trimEnd().endsWith(`// ${marker}`) ? [index + 1] : []);
        expect(lines.length, 'Unique source breakpoint marker').toBe(1);
        const variable = name => kind === 'argument' ? name : `local${name[0].toUpperCase()}${name.slice(1)}`;
        const capture = Object.fromEntries(names.map(name => [name, variable(name)]));
        capture.objects = ({ get }) => {
          const box = get(variable('box'));
          return {
            version: String(box.config.value.version.value), call: String(box.read()),
            boxed: Number(get(variable('boxed')).intValue()),
            arrays: Object.fromEntries(Object.keys(expectedArrays).map(name => [name, contents(get(variable(name)))])),
          };
        };
        watcher = await inspect.code.watch({ className, method: instance ? 'readInstance' : 'readStatic', fileLine: lines[0] }, { capture });
        const fixture = Java.use(className);
        fixture.result.value = '';
        // Native worker execution lets breakpoint callbacks run without blocking the Frida JS thread.
        fixture.start(instance);
        const completed = await drive.waitUntil(() => String(fixture.result.value) !== '', { timeoutMs: 15000 });
        expect(completed.ok, 'Native read matrix completes').toBe(true);
        expect(String(fixture.result.value)).toBe('ok:5');
        expect(Number(fixture.hits.value)).toBe(5);
        const result = await watcher.stop();
        expect(result.ok, result.error ?? 'All capture fields succeed').toBe(true);
        expect(result.data.length).toBe(5);
        for (const [index, record] of result.data.entries()) {
          const value = record.capture;
          expect(value.flag).toBe(index % 2 === 0);
          expect(value.tiny).toBe([-128, 127, -1, 0, 1][index]);
          expect(value.letter).toBe(['\0', '\uffff', '中', 'A', 'B'][index]);
          expect(value.small).toBe([-32768, 32767, -1, 0, 1][index]);
          expect(value.number).toBe([-2147483648, 2147483647, -1, 0, 1][index]);
          expect(String(value.wide)).toBe(['9007199254740993', '-9223372036854775808', '9223372036854775807', '-1', '0'][index]);
          expect(Object.is(value.single, [1.25, -0, NaN, Infinity, -Infinity][index])).toBe(true);
          expect(Object.is(value.fraction, [-2.5, -0, NaN, Infinity, -Infinity][index])).toBe(true);
          expect(value.text).toBe('读值🙂');
          expect(value.nil).toBe(null);
          expect(value.nullArray).toBe(null);
          expect(value.box.$className).toBe('com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture$Box');
          expect(value.boxed.$className).toBe('java.lang.Integer');
          expect(value.objects).toEqual({ version: 'jvmti-frida', call: 'jvmti-frida', boxed: -42, arrays: expectedArrays });
          for (const [name, expected] of Object.entries(expectedArrays)) {
            expect(contents(value[name]), `Direct capture ${name} remains readable after stop`).toEqual(expected);
          }
        }
      });
    }
  }
});
