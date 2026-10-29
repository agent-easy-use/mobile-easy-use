import Java from 'frida-java-bridge';

const fields = new Set();

export function field(definition, value) {
  if (arguments.length < 2 || typeof value === 'function') throw new TypeError('field requires a direct value');
  const { className, instance, field: name } = definition ?? {};
  const isStatic = className !== undefined;
  if (isStatic === (instance !== undefined)) throw new TypeError('Provide exactly one of className or instance');
  if (isStatic && (typeof className !== 'string' || !className.trim())) throw new TypeError('className must be a non-empty string');
  if (typeof name !== 'string' || !name || definition.filter !== undefined) throw new TypeError('Expected a field name without filter');
  let remove;
  Java.performNow(() => {
    if (!isStatic && (!instance?.$className || !instance.$h || instance.$h.isNull())) {
      throw new TypeError('instance must be a Java instance wrapper');
    }
    const source = isStatic ? Java.use(className) : instance;
    const selected = source[name];
    if (!selected || !('value' in selected)) throw new Error(`Java field not found: ${name}`);
    if ((selected.fieldType === 1) !== isStatic) throw new Error('Static fields require a class name; instance fields require an instance');
    for (const entry of fields) {
      if (entry.name === name && entry.static === isStatic && (isStatic
        ? entry.owner.class.$isSameObject(source.class) : entry.owner.$isSameObject(source))) {
        throw new Error('Field already has an override');
      }
    }
    const owner = Java.retain(source);
    const entry = { owner, name, static: isStatic };
    let original;
    // Retain the replacement independently of whether the App later changes the field.
    let replacement;
    try {
      if (value?.$h) replacement = Java.retain(value);
      // Frida field getters return owned references; keep the converted value until removal.
      original = owner[name].value;
      owner[name].value = replacement ?? value;
    } catch (error) {
      replacement?.$dispose();
      original?.$dispose?.();
      owner.$dispose();
      throw error;
    }
    fields.add(entry);
    let removed = false;
    remove = () => {
      if (removed) return;
      removed = true;
      Java.performNow(() => {
        owner[name].value = original;
        replacement?.$dispose();
        original?.$dispose?.();
        owner.$dispose();
        fields.delete(entry);
      });
    };
  });
  return remove;
}
