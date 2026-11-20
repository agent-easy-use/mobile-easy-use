import ObjC from 'frida-objc-bridge';
import objcSource from '../../../../ApiDemo/State/APIDebuggerFixture.m';
import swiftSource from '../../../../ApiDemo/State/APIDebuggerSwiftFixture.swift';

export function breakpoint(language = 'oc', marker = language === 'oc' ? 'BP_OC_VALUE' : 'BP_SWIFT_VALUE') {
  const source = language === 'oc' ? objcSource : swiftSource;
  const lines = source.split('\n').flatMap((line, i) => line.trimEnd().endsWith(`// ${marker}`) ? [i + 1] : []);
  if (lines.length !== 1) throw new Error(`Expected one source marker: ${marker}`);
  const name = language === 'oc' ? 'APIDebuggerFixture.m' : 'APIDebuggerSwiftFixture.swift';
  return { kind: 'source', file: `${__MEU_REPO_ROOT__}/fixtures/ios/ApiDemo/ApiDemo/State/${name}`, line: lines[0] };
}
export async function runNative(operation = 'oc', count = 1) {
  // Queue the native trigger and return to Frida before LLDB stops the main thread.
  await common.runOnMainThread(() => ObjC.classes.APIDebuggerFixture.shared().start_count_(operation, count));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = await common.runOnMainThread(() => JSON.parse(String(ObjC.classes.APIDebuggerFixture.shared().snapshotJSON())));
    if (state.done) {
      if (state.failure !== null) throw new Error(state.failure);
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Debugger fixture did not finish');
}
