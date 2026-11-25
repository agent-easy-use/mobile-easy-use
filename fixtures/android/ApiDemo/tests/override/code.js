import Java from 'frida-java-bridge';
const { code } = override;
import { breakpoint, className, reset, runNative } from '../common/debugger/helpers/fixture.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
let remove;
function definition(method, marker, owner) {
  const { target, ...location } = breakpoint(method, marker, owner);
  return { className: target, ...location };
}

describe('override.code', () => {
  beforeEach(reset);
  afterEach(async () => { if (remove) await remove(); remove = undefined; });
  test('writes and early return affect the native caller only until remove', async () => {
    reset();
    const { target, ...location } = breakpoint();
    remove = await code({ className: target, ...location }, { local: 42 }, ({ get }) => get('local'));
    const changed = await runNative();
    expect(changed.values).toEqual(['42']);
    expect(changed.tail).toBe(0);
    await remove();
    reset();
    expect((await runNative()).values).toEqual(['12']);
    await remove();
  });

  test('condition rejects writes and returns for nonmatching inputs', async () => {
    remove = await code({ ...definition(), condition: ({ get }) => get('input') === 2 }, { local: 20 });
    expect((await runNative('sequence', 3)).values).toEqual(['12', '22', '16']);
  });

  test('condition errors preserve original execution', async () => {
    remove = await code({ ...definition(), condition: () => { throw new Error('condition failure'); } }, undefined, 99);
    const state = await runNative();
    expect(state.values).toEqual(['12']);
    expect(state.tail).toBe(1);
  });

  test('writes share get and early return observes completed writes', async () => {
    let savedGet, before, sharedGet;
    remove = await code(definition(), { local: ({ get }) => {
      savedGet = get;
      before = get('local');
      return 30;
    } }, ({ get }) => {
      sharedGet = get === savedGet;
      return get('local');
    });
    const state = await runNative();
    expect(before).toBe(11);
    expect(sharedGet).toBe(true);
    expect(state.values).toEqual(['30']);
    expect(state.tail).toBe(0);
    expect(state.finally).toBe(0);
    let message;
    try { savedGet('local'); } catch (error) { message = error.message; }
    expect(message).toMatch(/only valid during/);
  });

  test('a failed write preserves successful writes and still attempts early return', async () => {
    remove = await code(definition(), { local: 25, missingVariable: 7 }, ({ get }) => get('local'));
    expect((await runNative()).values).toEqual(['25']);
  });

  test('incompatible writes and returns preserve native values', async () => {
    remove = await code(definition(), { local: 'not an int' }, 'not an int');
    const state = await runNative();
    expect(state.values).toEqual(['12']);
    expect(state.tail).toBe(1);
  });

  test('instance fields and local names resolve in their declared scopes', async () => {
    let before;
    remove = await code(definition('update', 'BP_NAMES', `${className}$Counter`), {
      local: ({ get }) => {
        before = { argument: get('count'), local: get('local'), amount: get('amount'), receiver: get('this').$className };
        return 9;
      }, amount: 40,
    });
    const state = await runNative('names');
    expect(before).toEqual({ argument: 3, local: 2, amount: 200, receiver: `${className}$Counter` });
    expect(state.values).toEqual(['182']);
  });

  test('nested arrays preserve contents across variable reads and writes', async () => {
    let before;
    remove = await code(definition('typeMatrix', 'BP_TYPE_Matrix'), { local: ({ get }) => {
      before = Array.from(get('local'), row => Array.from(row));
      return Java.array('[I', [Java.array('int', [1, 2]), Java.array('int', [3])]);
    } });
    const state = await runNative('typeMatrix');
    expect(before).toEqual([[7]]);
    expect(state.locals).toEqual([JSON.stringify([JSON.stringify(['1', '2']), JSON.stringify(['3'])])]);
  });

  test('void early return bypasses the body and finally block', async () => {
    remove = await code(definition('typeVoid', 'BP_TYPE_Void'), undefined, () => undefined);
    const state = await runNative('typeVoid');
    expect(state.values).toEqual(['void']);
    expect(state.tail).toBe(0);
    expect(state.finally).toBe(0);
  });

  test('Java object early return delivers the object read from the local', async () => {
    let name, label;
    remove = await code(definition('typeObject', 'BP_TYPE_Object'), undefined, ({ get }) => {
      const object = get('local');
      name = object.$className;
      label = String(object.label.value);
      return object;
    });
    const state = await runNative('typeObject');
    expect(name).toBe('com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture$Box');
    expect(state.values).toEqual([label]);
    expect(state.tail).toBe(0);
  });

  test('overloaded methods require an explicit signature', async () => {
    let message;
    try { await code(definition('overloaded', 'BP_OVERLOAD_INT'), undefined, 99); }
    catch (error) { message = error.message; }
    expect(message).toMatch(/argumentTypes/);
    remove = await code({ ...definition('overloaded', 'BP_OVERLOAD_INT'), argumentTypes: ['int'] }, undefined, 99);
    expect((await runNative('overloaded')).values).toEqual(['99']);
  });
  for (const [type, replacement, expected] of [
    ['Boolean', true, 'true'], ['Byte', -12, '-12'], ['Char', '中', '20013'], ['Short', -1234, '-1234'],
    ['Int', 42, '42'], ['Long', () => int64('9007199254740993'), '9007199254740993'],
    ['Float', 1.5, 'bits:3fc00000'], ['Double', -0, 'bits:8000000000000000'],
    ['String', '中文🙂', '中文🙂'], ['String', null, 'null'],
  ]) {
    test(`${type} locals and early returns preserve ${expected}`, async () => {
      remove = await code(definition(`type${type}`, `BP_TYPE_${type}`),
        { local: replacement }, ({ get }) => get('local'));
      const state = await runNative(`type${type}`);
      expect(state.values).toEqual([expected]);
      expect(state.tail).toBe(0);
    });
  }

  for (const [suffix, javaType, value, expected] of [
    ['Booleans', 'boolean', true, 'true'], ['Bytes', 'byte', -12, '-12'],
    ['Chars', 'char', '中', '20013'], ['Shorts', 'short', -1234, '-1234'],
    ['Ints', 'int', 42, '42'], ['Longs', 'long', () => int64('9007199254740993'), '9007199254740993'],
    ['Floats', 'float', 1.5, 'bits:3fc00000'], ['Doubles', 'double', -0, 'bits:8000000000000000'],
    ['Strings', 'java.lang.String', '中文🙂', '中文🙂'],
  ]) {
    test(`${javaType} array early return preserves its contents`, async () => {
      remove = await code(definition(`type${suffix}`, `BP_TYPE_${suffix}`),
        undefined, () => Java.array(javaType, [typeof value === 'function' ? value() : value]));
      const state = await runNative(`type${suffix}`);
      expect(state.values).toEqual([JSON.stringify([expected])]);
      expect(state.tail).toBe(0);
    });
  }
});
