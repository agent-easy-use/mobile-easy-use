import ObjC from 'frida-objc-bridge';
import { requireObjCRuntime } from '../common/main-thread.js';

function native(name, result, args) {
  return new NativeFunction(Module.getGlobalExportByName(name), result, args);
}

function accessors(instance, name) {
  const getProperty = native('class_getProperty', 'pointer', ['pointer', 'pointer']);
  const property = getProperty(instance.$class.handle, Memory.allocUtf8String(name));
  if (property.isNull()) throw new Error(`Objective-C property not found: ${name}`);
  const copyAttribute = native('property_copyAttributeValue', 'pointer', ['pointer', 'pointer']);
  const free = native('free', 'void', ['pointer']);
  const attribute = key => {
    const value = copyAttribute(property, Memory.allocUtf8String(key));
    if (value.isNull()) return null;
    try { return value.readCString(); }
    finally { free(value); }
  };
  if (attribute('R') !== null) throw new Error(`Property is readonly: ${name}`);
  const getter = `- ${attribute('G') ?? name}`;
  const setter = `- ${attribute('S') ?? `set${name[0].toUpperCase()}${name.slice(1)}:`}`;
  if (typeof instance[getter] !== 'function' || typeof instance[setter] !== 'function') {
    throw new Error(`Property accessors not found: ${name}`);
  }
  return { getter, setter };
}

const fields = new Set();

export async function field(definition, value) {
  requireObjCRuntime();
  const { instance, property: name } = definition ?? {};
  if (arguments.length < 2 || instance?.$kind !== 'instance' || typeof name !== 'string' || !name
    || definition.className !== undefined || definition.filter !== undefined || typeof value === 'function') {
    throw new TypeError('field requires an instance, property name and direct value, without filter');
  }
  const { getter, setter } = accessors(instance, name);
  const key = `${instance.handle}:${setter}`;
  if (fields.has(key)) throw new Error('Property already has an override');
  instance.retain();
  fields.add(key);
  let original, savedObject;
  try {
    original = instance[getter]();
    if (original instanceof ObjC.Object) {
      original.retain();
      savedObject = original;
    }
    instance[setter](value);
  } catch (error) {
    savedObject?.release();
    instance.release();
    fields.delete(key);
    throw error;
  }
  let removed = false;
  return async () => {
    if (removed) return;
    removed = true;
    try { instance[setter](original); }
    finally {
      savedObject?.release();
      instance.release();
      fields.delete(key);
    }
  };
}
