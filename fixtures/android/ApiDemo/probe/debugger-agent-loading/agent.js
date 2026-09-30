import Java from 'frida-java-bridge';
import { debuggerProbe, stopDebuggers } from '../../../../../sdk/android/probe/debugger/index.js';
const target = 'com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture';
let stop;
rpc.exports = {
  info() {
    let result;
    Java.performNow(() => {
      const loader = Java.use('com.agenteasyuse.mobileeasyuse.internal.MEUDebugger').class.getClassLoader();
      const path = Java.cast(loader, Java.use('dalvik.system.BaseDexClassLoader')).findLibrary('mobile_easy_use_native');
      result = { resolvedPath: path, modulePath: Process.findModuleByName('libmobile_easy_use_native.so')?.path ?? null };
    });
    return result;
  },
  async configure(fileLine) {
    Java.performNow(() => { Java.use(target).result.value = ''; });
    stop = await debuggerProbe({
      breakpoint: { target, method: 'compute', fileLine },
      observations: { input: 'input', local: 'local' },
      stack: 3,
    });
  },
  poll() { let result; Java.performNow(() => { result = Java.use(target).result.value; }); return result; },
  async stop() { return await stop(); },
  async dispose() { await stopDebuggers(); },
};
