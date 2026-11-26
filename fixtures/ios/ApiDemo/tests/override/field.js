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
  test('remove restores the saved value after an intervening App write', async () => {
    const remove = await override.field({ instance: state, property: 'mode' }, 3);
    removals.push(remove);
    state.setMode_(9);
    expect(Number(state.mode())).toBe(9);
    await remove();
    expect(Number(state.mode())).toBe(2);
  });

  test('weak replacement is not retained and the original is held until restoration', async () => {
    // Weak loads and bridge calls may create autoreleased temporary owners.
    // Drain those before asserting ownership, independently of SDK cleanup.
    const pool = ObjC.classes.NSAutoreleasePool.alloc().init();
    let replacement, remove;
    try {
      replacement = state.makeMock();
      remove = await override.field({ instance: state, property: 'weakPolicy' }, replacement);
      removals.push(remove);
      expect(Boolean(state.weakHasMock())).toBe(true);
      state.dropOriginalOwner();
      expect(Boolean(state.originalAlive())).toBe(true);
      state.dropMockOwner();
    } finally {
      if (replacement) replacement.release();
      pool.drain();
    }
    expect(Boolean(state.mockAlive()), 'Replacement has no remaining owner').toBe(false);
    expect(Boolean(state.weakEmpty())).toBe(true);
    const restorePool = ObjC.classes.NSAutoreleasePool.alloc().init();
    try { await remove(); } finally { restorePool.drain(); }
    expect(Boolean(state.originalAlive()), 'Original is released after restoration').toBe(false);
    expect(Boolean(state.weakEmpty())).toBe(true);
  });
  test('a rejected bridge value releases field ownership for the next override', async () => {
    let error;
    try { await override.field({ instance: state, property: 'mode' }, {}); }
    catch (caught) { error = caught; }
    expect(error !== undefined, 'Frida rejects an object for an NSInteger property').toBe(true);
    expect(Number(state.mode())).toBe(2);
    const remove = await override.field({ instance: state, property: 'mode' }, 3);
    removals.push(remove);
    expect(Number(state.mode())).toBe(3);
    await remove();
    expect(Boolean(state.scalarsRestored())).toBe(true);
  });
  test('missing properties reject without preventing a valid override', async () => {
    let error;
    try { await override.field({ instance: state, property: 'doesNotExist' }, 1); }
    catch (caught) { error = caught; }
    expect(String(error)).toContain('property not found');
    const remove = await override.field({ instance: state, property: 'mode' }, 3);
    removals.push(remove);
    expect(Number(state.mode())).toBe(3);
    await remove();
    expect(Boolean(state.scalarsRestored())).toBe(true);
  });

});

describe('override.field metadata', () => {
  test('property metadata selects custom accessors and rejects readonly properties', async () => {
    const state = ObjC.classes.APIOverrideFieldsFixture.alloc().init();
    let remove;
    try {
      remove = await override.field({ instance: state, property: 'customMode' }, 42);
      expect(Number(state.readCustomMode())).toBe(42);
      await remove();
      expect(Number(state.readCustomMode())).toBe(0);
      let error;
      try { await override.field({ instance: state, property: 'readonlyMode' }, 9); }
      catch (caught) { error = caught; }
      expect(String(error)).toContain('readonly');
      expect(Number(state.readonlyMode())).toBe(2);
    } finally { if (remove) await remove(); state.release(); }
  });
});
