import { installDebugger, attachDebugger, disposeDebugger } from '../../sdk/ios/probe/debugger.js';

let stop, stopObjC, stopCondition;
rpc.exports = {
  async attach() { await attachDebugger(); },
  async register(file, line, objcFile, objcLine) {
    stop = await installDebugger({
      breakpoint: { kind: 'source', file, line, condition: 'price == 100' },
      stack: 3,
      observations: {
        before: 'price', label: 'label', erased: 'erased', wide: 'wide', optional: 'optional',
        none: 'Optional<Int>.none', flag: 'true', decimal: '3.5', object: 'object',
        computed: '{ func twice(_ x: Int) -> Int { x * 2 }; return twice(price) }()',
        failure: 'missingVariable',
      },
      overrides: { price: 'price * 2', label: 'label + "!"' },
    });
    stopObjC = await installDebugger({
      breakpoint: { kind: 'source', file: objcFile, line: objcLine, condition: 'price == 10' },
      observations: { before: 'price', label: 'label', erased: 'erased', empty: 'empty',
        wide: '(long long)9223372036854775807LL', object: 'number', failure: 'missingVariable' },
      overrides: { price: 'price * 2', label: '[label stringByAppendingString:@"!"]' },
    });
    // A separate read-only registration verifies native condition errors without mutations.
    stopCondition = await installDebugger({
      breakpoint: { kind: 'source', file, line: line + 1, condition: 'missingConditionVariable' },
      observations: { unexpected: 'price' },
    });
  },
  async stop() { return stop(); },
  async stopobjc() { return stopObjC(); },
  async stopcondition() { return stopCondition(); },
  objcvalid() { return Module.getGlobalExportByName('debuggerObjCValid').readS32(); },
  swiftresults() { return ['debuggerSwiftFirst', 'debuggerSwiftSecond'].map(name =>
    new NativeFunction(Module.getGlobalExportByName(name), 'int', [])()); },
  async dispose() { await disposeDebugger(); },
};
