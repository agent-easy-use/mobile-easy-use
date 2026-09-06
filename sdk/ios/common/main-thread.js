import ObjC from 'frida-objc-bridge';

function requireObjCRuntime() {
  if (!ObjC.available) {
    throw new Error('Objective-C runtime is unavailable');
  }
}

function runOnMainThread(work) {
  requireObjCRuntime();
  if (typeof work !== 'function') {
    return Promise.reject(new Error('Main-thread work must be a function'));
  }
  return new Promise((resolve, reject) => {
    ObjC.schedule(ObjC.mainQueue, () => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      }
    });
  });
}

export { requireObjCRuntime, runOnMainThread };
