import Java from 'frida-java-bridge';
const { describe, test, afterEach, expect, run } = Test.create();
export { run };
const className = 'com.agenteasyuse.mobileeasyuse.apidemo.state.StaticResolutionFixture';
let remove;
describe('override.method first static invocation', () => {
  afterEach(async () => {
    if (remove) await remove();
    remove = undefined;
  });
  test('first Java invocation is overridden, filter fallback calls the original, and remove restores it', async () => {
    // This dedicated fixture is not used by navigation or other suites. Do not read its
    // fields or call any of its methods before installation: that would warm the class.
    let replacements = 0;
    remove = await override.method({
      className, method: 'target', argumentTypes: ['java.lang.String'],
      filter: value => String(value) === 'replace',
    }, () => {
      replacements++;
      return 'replacement';
    });
    const fixture = Java.use(className);
    expect(Number(fixture.getCalls()), 'A fresh fixture has never executed the original target').toBe(0);

    // invokeTarget is a Java call site; do not invoke the hooked target wrapper from JS.
    expect(String(fixture.invokeTarget('replace'))).toBe('replacement');
    expect(replacements).toBe(1);
    expect(Number(fixture.getCalls()), 'Replacement bypasses the original body').toBe(0);

    expect(String(fixture.invokeTarget('passthrough'))).toBe('original:passthrough');
    expect(replacements).toBe(1);
    expect(Number(fixture.getCalls()), 'Filter fallback executes the original exactly once').toBe(1);

    await remove();
    expect(String(fixture.invokeTarget('replace'))).toBe('original:replace');
    expect(replacements).toBe(1);
    expect(Number(fixture.getCalls()), 'Removal restores the native call site').toBe(2);
  });
});
