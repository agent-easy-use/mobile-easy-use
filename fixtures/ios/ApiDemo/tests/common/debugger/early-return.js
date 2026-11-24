import { installDebugger } from '../../../../../../sdk/ios/common/debugger.js';
import { breakpoint, runNative } from './helpers/fixture.js';
const { describe, test, expect, run } = Test.create();
export { run };

describe('LLDB early return regression', () => {
  test('changing return breakpoints uses the new method frame', async () => {
    const stopInt = await installDebugger({ breakpoint: breakpoint('oc', 'BP_RETURN_INT'), earlyReturn: '(int)200' });
    try {
      const state = await runNative('returnInt');
      expect((await stopInt()).ok).toBe(true);
      expect(state.values).toEqual([200]);
      expect(state.tail).toBe(0);
    } finally { await stopInt(); }

    const stopDouble = await installDebugger({ breakpoint: breakpoint('oc', 'BP_RETURN_DOUBLE'), earlyReturn: '(double)3.5' });
    try {
      const state = await runNative('returnDouble');
      const result = await stopDouble();
      expect(result.ok, result.error ?? 'new method frame is available').toBe(true);
      expect(state.values).toEqual([3.5]);
      expect(state.tail).toBe(0);
    } finally { await stopDouble(); }
  });

  test('two early returns without changing any breakpoint between hits', async () => {
    const stop = await installDebugger({ breakpoint: breakpoint('oc', 'BP_RETURN_INT'), earlyReturn: '(int)200' });
    try {
      const state = await runNative('returnInt', 2);
      const result = await stop();
      expect(result.ok, result.error ?? 'both returns succeed').toBe(true);
      expect(state.values).toEqual([200, 200]);
      expect(state.tail).toBe(0);
    } finally { await stop(); }
  });

  for (const [operation, marker, expression, value] of [
    ['returnInt', 'BP_RETURN_INT', '(int)200', 200],
    ['returnDouble', 'BP_RETURN_DOUBLE', '(double)3.5', 3.5],
    ['returnBool', 'BP_RETURN_BOOL', '(BOOL)0', false],
    ['returnWide', 'BP_RETURN_WIDE', '(long long)9223372036854775807LL', '9223372036854775807'],
    ['returnObject', 'BP_RETURN_OBJECT', '(id)@"replacement"', 'replacement'],
    ['returnObject', 'BP_RETURN_OBJECT', '(id)nil', null],
    ['swift', 'BP_SWIFT_VALUE', 'Int(200)', 200],
    ['ocVoid', 'BP_OC_VOID', '(void)0', 'void'],
  ]) {
    test(`${operation} returns ${expression} to the native caller`, async () => {
      const stop = await installDebugger({ breakpoint: breakpoint(operation === 'swift' ? 'swift' : 'oc', marker), earlyReturn: expression });
      try {
        const state = await runNative(operation);
        const result = await stop();
        expect(result.ok, result.error ?? 'early return succeeds').toBe(true);
        expect(state.values, 'Native caller receives the requested value').toEqual([value]);
        expect(state.tail, 'Remaining native method body is skipped').toBe(0);
      } finally { await stop(); }
    });
  }
});
