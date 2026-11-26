let runtime;
// Keep native strings and callbacks alive until their subscription is released.
const subscriptions = new Set();

function getRuntime() {
  if (runtime) return runtime;
  const bridge = Process.getModuleByName('MobileEasyUse.dylib');
  const native = {
    register: new NativeFunction(bridge.getExportByName('mobile_easy_use_register_nslog_watch'),
      'pointer', ['pointer', 'uint', 'pointer']),
    unregister: new NativeFunction(bridge.getExportByName('mobile_easy_use_unregister_nslog_watch'), 'void', ['pointer']),
  };
  Interceptor.replace(Module.getGlobalExportByName('NSLog'), bridge.getExportByName('mobile_easy_use_replace_nslog'));
  Script.bindWeak(native, () => {
    // The iOS bridge outlives the script; no subscription may retain a dead JS
    // callback. Pin the script until its in-flight native deliveries finish.
    Script.pin();
    return Promise.all([...subscriptions].map(resource => resource.cleanup()))
      .finally(() => Script.unpin());
  });
  runtime = native;
  return runtime;
}

export async function installLogCapture(tags, receive) {
  const native = getRuntime();
  const filters = tags.map(tag => ({
    tag: Memory.allocUtf8String(tag), prefix: Memory.allocUtf8String(`[${tag}] `),
  }));
  const table = Memory.alloc(filters.length * Process.pointerSize * 2);
  filters.forEach((filter, index) => {
    const entry = table.add(index * Process.pointerSize * 2);
    entry.writePointer(filter.tag);
    entry.add(Process.pointerSize).writePointer(filter.prefix);
  });
  let enabled = true;
  const callback = new NativeCallback((tag, message) => {
    if (!enabled) return;
    if (receive(() => ({ tag: tag.readUtf8String() ?? '', level: null, message: message.readUtf8String() ?? '' })) === false) {
      enabled = false;
    }
  }, 'void', ['pointer', 'pointer']);
  const subscription = native.register(table, filters.length, callback);
  if (subscription.isNull()) throw new Error('Cannot allocate NSLog subscription');
  let resources = { filters, table, callback, subscription };
  let cleanupPromise;
  const cleanup = () => {
    if (!cleanupPromise) cleanupPromise = Promise.resolve().then(() => {
      enabled = false;
      // Cooperative native call: release the JS lock while waiting for readers.
      // The write lock drains callbacks and frees the node before returning.
      native.unregister(subscription);
      subscriptions.delete(resources);
      resources = null;
    }).catch(error => {
      cleanupPromise = undefined;
      throw error;
    });
    return cleanupPromise;
  };
  resources.cleanup = cleanup;
  subscriptions.add(resources);
  return cleanup;
}
