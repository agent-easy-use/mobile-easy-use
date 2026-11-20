import Java from 'frida-java-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const className = 'com.agenteasyuse.mobileeasyuse.apidemo.state.OverrideFieldsFixture';
let state, removals;
describe('override.field', () => {
  beforeEach(() => {
    state = Java.use(className).$new();
    removals = [];
  });
  afterEach(async () => {
    try { for (const remove of removals.reverse()) await remove(); }
    finally { state.$dispose(); }
  });
  test('instance primitive and reference fields restore their original values', async () => {
    const removeMode = await override.field({ instance: state, field: 'mode' }, 3);
    removals.push(removeMode);
    const removeRegion = await override.field({ instance: state, field: 'region' }, 'JP');
    removals.push(removeRegion);
    // Read actual Java fields, then use the native fixture to verify restoration.
    expect(Number(state.mode.value)).toBe(3);
    expect(String(state.region.value)).toBe('JP');
    expect(Boolean(state.restored())).toBe(false);
    await removeRegion();
    await removeMode();
    // Frida converts Java String fields to JS strings: restoration guarantees value, not String identity.
    expect(Number(state.mode.value)).toBe(2);
    expect(String(state.region.value)).toBe('original-region');
    await removeMode();
    expect(Number(state.mode.value)).toBe(2);
  });
  test('static fields affect the class and remove restores them', async () => {
    const owner = Java.use(className);
    const remove = await override.field({ className, field: 'staticEnabled' }, true);
    removals.push(remove);
    expect(Boolean(owner.staticEnabled.value)).toBe(true);
    expect(Boolean(state.restored())).toBe(false);
    await remove();
    expect(Boolean(owner.staticEnabled.value)).toBe(false);
    expect(Boolean(state.restored())).toBe(true);
  });
  test('a duplicate field override is rejected without replacing the active value', async () => {
    const remove = await override.field({ instance: state, field: 'mode' }, 3);
    removals.push(remove);
    let error;
    try { removals.push(await override.field({ instance: state, field: 'mode' }, 8)); }
    catch (caught) { error = caught; }
    expect(String(error)).toContain('already has an override');
    expect(Number(state.mode.value)).toBe(3);
    await remove();
    expect(Boolean(state.restored())).toBe(true);
  });
  test('ordinary Java object fields restore the original reference', async () => {
    const original = state.policy.value;
    const replacement = Java.use('java.lang.Object').$new();
    try {
      const remove = await override.field({ instance: state, field: 'policy' }, replacement);
      removals.push(remove);
      expect(state.policy.value.$isSameObject(replacement)).toBe(true);
      await remove();
      expect(state.policy.value.$isSameObject(original)).toBe(true);
      expect(Boolean(state.restored())).toBe(true);
    } finally {
      original.$dispose();
      replacement.$dispose();
    }
  });
});
