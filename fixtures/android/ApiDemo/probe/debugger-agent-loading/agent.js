import Java from 'frida-java-bridge';
import { code } from '../../../../../sdk/android/inspect/code.js';
const target = 'com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture';
let watcher;
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
    watcher = await code.watch({ className: target, method: 'compute', fileLine },
      { capture: { input: 'input', local: 'local' }, stack: 3 });
  },
  poll() { let result; Java.performNow(() => { result = Java.use(target).result.value; }); return result; },
  async stop() {
    const result = await watcher.stop();
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
};
