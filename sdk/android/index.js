import Java from 'frida-java-bridge';
import { installRuntimeRpc } from '../common/runtime.js';
import { create as createTest } from '../common/test/index.js';
import { drive } from './drive/index.js';
import { override } from './override/index.js';
import { inspect } from './inspect/index.js';
import { runOnMainThread } from './common/main-thread.js';
import { currentThreadName } from './common/thread.js';
import { findUiView } from './element/query.js';
import { resolveView } from './element/target.js';
import { checkUiStateNow } from './element/state.js';
import { R } from './element/resources.js';

const element = Object.freeze({
  findUiView: target => runOnMainThread(() => findUiView(target)),
});
const common = Object.freeze({ runOnMainThread, currentThreadName });
const Test = { create: () => createTest(resolveView, runOnMainThread, checkUiStateNow, inspect.ui) };

Object.assign(globalThis, { drive, override, inspect, element, common, Test, Java, R });
globalThis.runtimeStatus = () => {
  const available = Java.available === true;
  let appId = null;
  let releaseVersion = null;
  if (available) {
    Java.performNow(() => {
      const ActivityThread = Java.use('android.app.ActivityThread');
      const application = ActivityThread.currentApplication();
      const packageName = application === null
        ? ActivityThread.currentPackageName()
        : application.getPackageName();
      appId = packageName === null ? null : packageName.toString();
      const MobileEasyUse = Java.use('com.agenteasyuse.mobileeasyuse.MobileEasyUse');
      releaseVersion = MobileEasyUse.version().toString();
    });
  }
  return {
    platform: 'android',
    available,
    appId,
    releaseVersion,
  };
};

installRuntimeRpc();

export { drive, override, inspect, element, common, Test, Java, R };
