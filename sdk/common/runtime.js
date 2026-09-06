const sdkExports = Object.freeze({
  async loadPresetBundle(modulePath, source) {
    await Script.load(modulePath, source);
  },

  async callFunction(modulePath, source, functionName, args) {
    let module;
    try {
      module = await import(modulePath);
    } catch (error) {
      if (error?.message !== `could not load module '${modulePath}'`) {
        throw error;
      }
      module = await Script.load(modulePath, source);
    }
    const fn = module[functionName];
    if (typeof fn !== 'function') {
      throw new Error(`Function not found: ${modulePath}.${functionName}`);
    }
    return await fn(...args);
  },

  async evalScript(scriptName, source) {
    return await Script.evaluate(scriptName, source);
  },

  runtimeStatus() {
    return globalThis.runtimeStatus();
  },
});

function installRuntimeRpc() {
  Object.defineProperty(rpc, 'exports', {
    value: sdkExports,
    writable: false,
    configurable: false,
    enumerable: true,
  });
}

export { installRuntimeRpc };
