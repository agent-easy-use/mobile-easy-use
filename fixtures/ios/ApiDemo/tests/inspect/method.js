import ObjC from 'frida-objc-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const className = 'APISDKFixtureState';
const definition = { className, selector: '- single:' };
let state, watcher;
function callSingle(value) { return String(state.single_(value)); }
function readString(value) { return String(new ObjC.Object(value)); }
describe('inspect.method', () => {
  beforeEach(() => {
    state = ObjC.classes.APISDKFixtureState.sharedState();
    state.resetForCategory_scenario_('test', 'method');
  });
  afterEach(async () => {
    if (watcher) {
      const stopped = await watcher.stop();
      expect(stopped.ok, stopped.error ?? 'Watcher cleanup succeeds').toBe(true);
    }
    watcher = undefined;
  });
  test('default observation preserves native execution and stops collecting', async () => {
    watcher = await inspect.method.watch(definition);
    expect(callSingle('one')).toBe('single:one');
    const current = await watcher.current();
    expect(current.ok, current.error ?? 'capture succeeds').toBe(true);
    expect(current.data.length).toBe(1);
    expect(current.data[0].status).toBe('returned');
    expect(current.data[0].enter).toBe(undefined);
    expect(current.data[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(callSingle('two')).toBe('single:two');
    const stopped = await watcher.stop();
    expect(stopped.data.length).toBe(2);
    expect(callSingle('three')).toBe('single:three');
    expect(Number(state.originalCallCount_('single:'))).toBe(3);
    expect(await watcher.stop()).toEqual(stopped);
    expect((await watcher.current()).ok).toBe(false);
  });
  test('filter selects calls and enter/leave capture native arguments and results', async () => {
    watcher = await inspect.method.watch({ ...definition, filter: value => readString(value) === 'keep' }, {
      stack: 3,
      enter: ({ receiver, args }) => ({ receiverClass: receiver.$className, input: readString(args[0]) }),
      leave: ({ args, result, exception }) => ({ input: readString(args[0]), output: readString(result), noException: exception === undefined }),
    });
    expect(callSingle('skip')).toBe('single:skip');
    expect(callSingle('keep')).toBe('single:keep');
    const result = await watcher.stop();
    expect(result.ok, result.error ?? 'capture succeeds').toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].enter).toEqual({ receiverClass: className, input: 'keep' });
    expect(result.data[0].leave).toEqual({ input: 'keep', output: 'single:keep', noException: true });
    expect(result.data[0].stack.length).toBeGreaterThan(0);
    expect(result.data[0].stack.length).toBeLessThanOrEqual(3);
    expect(Number(state.originalCallCount_('single:'))).toBe(2);
  });
  test('static method observation preserves its native return', async () => {
    watcher = await inspect.method.watch({ className, selector: "+ staticValue" }, {
      leave: ({ result }) => ({ output: readString(result) }),
    });
    const owner = ObjC.classes.APISDKFixtureState;
    expect(String(owner.staticValue())).toBe('static-original');
    const result = await watcher.stop();
    expect(result.ok, result.error ?? 'static capture succeeds').toBe(true);
    expect(result.data.map(record => record.leave.output)).toEqual(['static-original']);
  });
});
