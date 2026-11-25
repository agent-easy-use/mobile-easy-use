const { describe, test, beforeEach, afterEach, expect, list, run } = Test.create();
export { run };

let phases;
describe('Test public runtime', () => {
  beforeEach(() => { phases = ['beforeEach']; });
  afterEach(() => {
    phases.push('afterEach');
    expect(phases, 'Hooks surround the registered test').toEqual(['beforeEach', 'test', 'afterEach']);
  });

  test('list describes the registered test without executing it', () => {
    expect(list()).toEqual([{
      describe: 'Test public runtime',
      test: 'list describes the registered test without executing it',
    }]);
    expect(phases, 'Listing does not execute hooks or test bodies').toEqual(['beforeEach']);
    phases.push('test');
  });
});
