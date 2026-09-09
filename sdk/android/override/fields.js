import Java from 'frida-java-bridge';

function referenceField(target, name) {
  // Reflection preserves object identity, including Strings that .value otherwise unboxes.
  for (let cls = target.class; cls !== null; cls = cls.getSuperclass()) {
    const fields = cls.getDeclaredFields();
    for (const field of fields) {
      const actual = String(field.getName());
      if (actual === name || (name === `_${actual}` && typeof target[actual] === 'function')) {
        field.setAccessible(true);
        return field;
      }
    }
  }
  throw new Error(`Java reference field not found: ${name}`);
}

export function installField(definition, target) {
  const name = definition.field;
  if (typeof name !== 'string' || !name || !Object.hasOwn(definition, 'withValue')
    || ['method', 'withReturn', 'filter', 'argumentTypes', 'allOverloads'].some(key => Object.hasOwn(definition, key))) {
    throw new Error('Override field requires field and withValue, without method options');
  }
  const field = target?.[name];
  if (!field || typeof field !== 'object' || !('value' in field)) throw new Error(`Java field not found: ${name}`);
  const owner = Java.retain(target);
  const reference = field.fieldReturnType?.type === 'pointer';
  let reflected, original, replacement;
  let written = false;
  const dispose = () => {
    if (reference) {
      replacement?.$dispose();
      original?.$dispose();
      reflected?.$dispose();
    }
    owner.$dispose();
  };
  try {
    reflected = reference ? referenceField(owner, name) : null;
    original = reference ? reflected.get(owner.$h === null ? null : owner) : field.value;
    owner[name].value = definition.withValue;
    written = true;
    // Keep the assigned object alive even if the App replaces the field during action.
    if (reference) replacement = reflected.get(owner.$h === null ? null : owner);
  } catch (error) {
    try {
      if (written) reflected.set(owner.$h === null ? null : owner, original);
    } finally { dispose(); }
    throw error;
  }
  return () => Java.performNow(() => {
    try {
      if (reference) reflected.set(owner.$h === null ? null : owner, original);
      else owner[name].value = original;
    } finally { dispose(); }
  });
}
