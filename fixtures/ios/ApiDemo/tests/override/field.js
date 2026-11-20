import ObjC from 'frida-objc-bridge';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
let state, removals;
describe('override.field', () => {
  beforeEach(() => {
    state = ObjC.classes.APIOverrideFieldsFixture.alloc().init();
    removals = [];
  });
  afterEach(async () => {
    try { for (const remove of removals.reverse()) await remove(); }
    finally { state.release(); }
  });
  test('scalar and strong properties are assigned through setters and restored', async () => {
    const removeMode = await override.field({ instance: state, property: 'mode' }, 3);
    removals.push(removeMode);
    const removeRegion = await override.field({ instance: state, property: 'region' }, ObjC.classes.NSString.stringWithString_('JP'));
    removals.push(removeRegion);
    expect(Number(state.mode())).toBe(3);
    expect(String(state.region())).toBe('JP');
    expect(Boolean(state.scalarsRestored())).toBe(false);
    expect(Boolean(state.objectsRestored())).toBe(false);
    await removeRegion();
    await removeMode();
    expect(Boolean(state.scalarsRestored())).toBe(true);
    expect(Boolean(state.objectsRestored())).toBe(true);
    await removeMode();
  });
  test('inherited property is resolved and its object identity is restored', async () => {
    const remove = await override.field({ instance: state, property: 'inheritedText' }, ObjC.classes.NSString.stringWithString_('new'));
    removals.push(remove);
    expect(String(state.inheritedText())).toBe('new');
    await remove();
    expect(Boolean(state.objectsRestored())).toBe(true);
  });
  test('a duplicate property override is rejected without changing the active value', async () => {
    const remove = await override.field({ instance: state, property: 'mode' }, 3);
    removals.push(remove);
    let error;
    try { removals.push(await override.field({ instance: state, property: 'mode' }, 8)); }
    catch (caught) { error = caught; }
    expect(String(error)).toContain('already has an override');
    expect(Number(state.mode())).toBe(3);
    await remove();
    expect(Boolean(state.scalarsRestored())).toBe(true);
  });
});
