import Java from 'frida-java-bridge';
import { installRuntimeRpc } from '../common/runtime.js';
import { create as createTest } from '../common/test/index.js';
import { runOnMainThread } from './common/index.js';
import { AndroidExp } from './exp/index.js';
import { findUiView } from './exp/ui.js';
import { R } from './framework/index.js';
import { Override } from './override/index.js';
import { Probe } from './probe/index.js';
import { checkUiStateNow } from './exp/ui-state.js';

const Test = { create: () => createTest(findUiView, runOnMainThread, checkUiStateNow) };

globalThis.Java = Java;
globalThis.R = R;
globalThis.AndroidExp = AndroidExp;
globalThis.Override = Override;
globalThis.Probe = Probe;
globalThis.Test = Test;
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

export {
  AndroidExp,
  Override,
  Probe,
  R,
  Test,
};
