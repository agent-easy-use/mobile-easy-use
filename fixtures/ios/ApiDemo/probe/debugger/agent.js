// This module uses the packaged SDK globals, exactly as a user probe does.
let stop;
export async function attach() { return Probe.debugger.attach(); }
export async function detach() { return Probe.debugger.detach(); }
export async function concurrentAttach() {
  const results = await Promise.allSettled([Probe.debugger.attach(), Probe.debugger.attach()]);
  return results.map(item => ({ status: item.status, error: String(item.reason ?? '') }));
}
export async function register(definition) { stop = await Probe.debugger(definition); }
export async function collect() { return stop(); }
export async function concurrentStop() { return Promise.all([stop(), stop()]); }
export function address() { return ObjC.classes.APIDebuggerFixture['- calculate:'].implementation.toString(); }
export function trigger(operation, count = 1) { ObjC.classes.APIDebuggerFixture.shared().start_count_(operation, count); }
export function poll() { return JSON.parse(ObjC.classes.APIDebuggerFixture.shared().snapshotJSON().toString()); }
