import Java from 'frida-java-bridge';

function requireJavaRuntime() {
  if (!Java.available) {
    throw new Error('Java runtime is unavailable');
  }
}

function runOnMainThread(work) {
  requireJavaRuntime();
  if (typeof work !== 'function') {
    return Promise.reject(new Error('Main-thread work must be a function'));
  }
  return new Promise((resolve, reject) => {
    Java.scheduleOnMainThread(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      }
    });
  });
}

export { requireJavaRuntime, runOnMainThread };
