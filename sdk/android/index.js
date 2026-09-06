import Java from 'frida-java-bridge';
import { installRuntimeRpc } from '../common/runtime.js';
import { AndroidExp } from './exp/index.js';
import { R } from './framework/index.js';
import { Override } from './override/index.js';
import { Probe } from './probe/index.js';

globalThis.Java = Java;
globalThis.R = R;
globalThis.AndroidExp = AndroidExp;
globalThis.Override = Override;
globalThis.Probe = Probe;
globalThis.runtimeStatus = () => {
  const available = Java.available === true;
  let appId = null;
  if (available) {
    Java.performNow(() => {
      const ActivityThread = Java.use('android.app.ActivityThread');
      const application = ActivityThread.currentApplication();
      const packageName = application === null
        ? ActivityThread.currentPackageName()
        : application.getPackageName();
      appId = packageName === null ? null : packageName.toString();
    });
  }
  return {
    platform: 'android',
    available,
    appId,
  };
};

installRuntimeRpc();

export {
  AndroidExp,
  Override,
  Probe,
  R,
};
