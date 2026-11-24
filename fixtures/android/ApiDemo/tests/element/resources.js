import Java from 'frida-java-bridge';
const { describe, test, expect, run } = Test.create();
export { run };
describe('R resources', () => {
  test('IDs and strings match compiled App resources', () => {
    const ids = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$id');
    const strings = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$string');
    expect(R.id.api_resource_id_target).toBe(Number(ids.api_resource_id_target.value));
    expect(R.string.api_resource_string).toBe(Number(strings.api_resource_string.value));
    expect(R.id.api_resource_id_target).toBeGreaterThan(0);
  });
  test('missing resources do not poison later lookups', () => {
    expect(R.id.api_resource_missing).toBe(0);
    const ids = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.R$id');
    expect(R.id.api_resource_id_target).toBe(Number(ids.api_resource_id_target.value));
  });
});
