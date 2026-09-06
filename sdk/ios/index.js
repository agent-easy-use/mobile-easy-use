import ObjC from 'frida-objc-bridge';
import { installRuntimeRpc } from '../common/runtime.js';
import { runOnMainThread } from './common/main-thread.js';
import { IOSInput } from './input.js';
import { Override } from './override/index.js';
import { Probe } from './probe/index.js';
import { screenshot } from './screenshot.js';
import { findUiView } from './ui/index.js';
import { waitForUi, waitUntil } from './wait.js';

const IOS = Object.freeze({
  runOnMainThread,
  screenshot,
  ui: Object.freeze({
    find: findUiView,
  }),
  input: IOSInput,
  wait: Object.freeze({
    ui: waitForUi,
    until: waitUntil,
  }),
});

globalThis.ObjC = ObjC;
globalThis.IOS = IOS;
globalThis.Override = Override;
globalThis.Probe = Probe;
globalThis.runtimeStatus = () => {
  const available = ObjC.available === true;
  let appId = null;
  if (available) {
    const identifier = ObjC.classes.NSBundle.mainBundle().bundleIdentifier();
    appId = identifier === null ? null : identifier.toString();
  }
  return {
    platform: 'ios',
    available,
    appId,
  };
};

installRuntimeRpc();

export { IOS, Override, Probe };
