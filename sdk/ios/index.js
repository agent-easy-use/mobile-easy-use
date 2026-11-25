import ObjC from 'frida-objc-bridge';
import Swift from 'frida-swift-bridge';
import { installRuntimeRpc } from '../common/runtime.js';
import { create as createTest } from '../common/test/index.js';
import { drive } from './drive/index.js';
import { override } from './override/index.js';
import { inspect } from './inspect/index.js';
import { runOnMainThread } from './common/main-thread.js';
import { currentThreadName } from './common/thread.js';
import { findUiView } from './element/query.js';
import { findClass } from './common/class.js';

const element = Object.freeze({
  findUiView: target => runOnMainThread(() => findUiView(target)),
});
const common = Object.freeze({ runOnMainThread, currentThreadName, findClass });
const Test = { create: () => createTest(inspect.ui) };

Object.assign(globalThis, { drive, override, inspect, element, common, Test, ObjC, Swift });
globalThis.runtimeStatus = () => {
  const available = ObjC.available === true;
  let appId = null;
  let releaseVersion = null;
  if (available) {
    const identifier = ObjC.classes.NSBundle.mainBundle().bundleIdentifier();
    appId = identifier === null ? null : identifier.toString();
    try {
      const versionFunction = new NativeFunction(
        Module.getGlobalExportByName('mobile_easy_use_version'),
        'pointer',
        [],
      );
      releaseVersion = versionFunction().readCString();
    } catch {
      releaseVersion = null;
    }
  }
  return {
    platform: 'ios',
    available,
    appId,
    releaseVersion,
  };
};

installRuntimeRpc();

export { drive, override, inspect, element, common, Test, ObjC, Swift };
