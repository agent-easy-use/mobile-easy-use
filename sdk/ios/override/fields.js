import ObjC from 'frida-objc-bridge';

function native(name, result, args) {
  return new NativeFunction(Module.getGlobalExportByName(name), result, args);
}

let objectRuntime;
function getObjectRuntime() {
  if (!objectRuntime) {
    objectRuntime = {
      // Objective-C runtime SPI reports inherited ivar ownership without guessing from property names.
      ownership: native('_class_getIvarMemoryManagement', 'int', ['pointer', 'pointer']),
      retain: native('objc_retain', 'pointer', ['pointer']),
      release: native('objc_release', 'void', ['pointer']),
      storeStrong: native('objc_storeStrong', 'void', ['pointer', 'pointer']),
      copyWeak: native('objc_copyWeak', 'void', ['pointer', 'pointer']),
      loadWeak: native('objc_loadWeakRetained', 'pointer', ['pointer']),
      storeWeak: native('objc_storeWeak', 'pointer', ['pointer', 'pointer']),
      destroyWeak: native('objc_destroyWeak', 'void', ['pointer']),
    };
  }
  return objectRuntime;
}

function installObject(target, ivar, value) {
  if (value !== null && !(value instanceof ObjC.Object)) {
    throw new Error('Override object ivar requires an Objective-C object or null');
  }
  const api = getObjectRuntime();
  const ownership = api.ownership(target.$class.handle, ivar);
  // objc_ivar_memory_management_t: unknown=0, strong=1, weak=2, unretained=3.
  if (ownership !== 1 && ownership !== 2) {
    throw new Error('Override object ivar ownership is unsupported');
  }
  const address = target.handle.add(ObjC.api.ivar_getOffset(ivar).toInt32());
  const replacement = value === null ? NULL : value.handle;
  const weak = ownership === 2;
  const original = weak ? Memory.alloc(Process.pointerSize) : api.retain(address.readPointer());
  if (weak) api.copyWeak(original, address);
  api.retain(replacement);
  const dispose = () => {
    if (weak) api.destroyWeak(original);
    else api.release(original);
    api.release(replacement);
  };
  try {
    if (weak) api.storeWeak(address, replacement);
    else api.storeStrong(address, replacement);
  } catch (error) {
    dispose();
    throw error;
  }
  return () => {
    try {
      if (weak) {
        const saved = api.loadWeak(original);
        try { api.storeWeak(address, saved); }
        finally { api.release(saved); }
      } else {
        api.storeStrong(address, original);
      }
    } finally { dispose(); }
  };
}

export function installField(definition) {
  const {target, field: name, withValue: value} = definition;
  if (target?.$kind !== 'instance' || typeof name !== 'string' || !name
    || !Object.hasOwn(definition, 'withValue')
    || ['selector', 'withReturn', 'filter'].some(key => Object.hasOwn(definition, key))) {
    throw new Error('Override field requires an instance, field and withValue, without method options');
  }
  if (!(name in target.$ivars)) throw new Error(`Objective-C ivar not found: ${name}`);
  const getIvar = native('class_getInstanceVariable', 'pointer', ['pointer', 'pointer']);
  const ivar = getIvar(target.$class.handle, Memory.allocUtf8String(name));
  const encoding = ObjC.api.ivar_getTypeEncoding(ivar).readCString();
  const object = encoding === '@' || encoding.startsWith('@"');
  if (!object && !/^[cCsSiIlLqQfdB]$/.test(encoding)) {
    throw new Error(`Override ivar type is unsupported: ${encoding}`);
  }
  target.retain();
  let restore;
  try {
    if (object) {
      restore = installObject(target, ivar, value);
    } else {
      const original = target.$ivars[name];
      target.$ivars[name] = typeof value === 'boolean' ? Number(value) : value;
      restore = () => { target.$ivars[name] = original; };
    }
  } catch (error) {
    target.release();
    throw error;
  }
  return () => {
    try { restore(); }
    finally { target.release(); }
  };
}
