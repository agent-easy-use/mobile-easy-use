import assert from 'node:assert/strict';

const clean = hits => {
  for (const hit of hits) assert.equal(hit.errors, undefined, JSON.stringify(hit.errors));
};
const stages = hit => (hit.errors ?? []).map(error => error.stage);
const one = hits => { assert.equal(hits.length, 1); return hits[0]; };

// Expectations describe the public API, without adapting to LLDB failures.
export function cases(source) {
  const result = [];
  for (const language of ['oc', 'swift']) {
    const swift = language === 'swift';
    const location = source(language, 'VALUE');
    const base = { breakpoint: location };
    const entry = (name, config, verify, extra = {}) => result.push({
      name: `${language}/${name}`, operation: language,
      definition: { ...base, ...config }, verify, ...extra,
    });
    entry('observations-stack', {
      observations: { input: 'input', local: 'price', property: 'self.field', label: 'label',
        bool: swift ? 'true' : '(BOOL)YES', empty: 'empty', object: 'object',
        calculated: swift ? '{ func twice(_ x: Int) -> Int { x * 2 }; return twice(price) }()' : 'price * 2' },
      stack: 3,
    }, ({ hits, actual }) => {
      const hit = one(hits); clean(hits);
      assert.deepEqual({ ...hit.observations, object: undefined }, {
        input: 10, local: 10, property: 5, label: 'hello 世界', bool: true,
        empty: null, object: undefined, calculated: 20,
      });
      assert.equal(typeof hit.observations.object, 'string');
      assert(hit.stack.length > 0 && hit.stack.length <= 3);
      assert.match(hit.stack[0].function, /calculate/);
      assert.deepEqual(actual.values, [15]);
    });
    entry('observation-error-isolation', { observations: { bad: 'missingVariable', good: 'price' }, overrides: { 'self.field': '30' } }, ({ hits, actual }) => {
      const hit = one(hits);
      assert.deepEqual(hit.observations, { good: 10 });
      assert.deepEqual(stages(hit), ['observations']);
      assert.equal(hit.errors[0].name, 'bad');
      assert.equal(hit.stack, undefined);
      assert.deepEqual(actual.values, [40]);
    });
    entry('overrides', { overrides: { price: '20', 'self.field': '30' } }, ({ hits, actual }) => {
      clean(hits); one(hits);
      assert.deepEqual(actual.values, [50]);
      assert.equal(actual.field, 30);
    });
    entry('override-error-isolation', { overrides: { missingVariable: '20', 'self.field': '30' } }, ({ hits, actual }) => {
      assert.deepEqual(stages(one(hits)), ['overrides']);
      assert.deepEqual(actual.values, [40]);
    });
    for (const [condition, count] of [[swift ? 'true' : '1', 2], [swift ? 'false' : '0', 0]]) {
      entry(`condition-${count ? 'true' : 'false'}`, { breakpoint: { ...location, condition }, observations: { value: 'price' } }, ({ hits, actual }) => {
        assert.equal(hits.length, count); clean(hits);
        assert.deepEqual(actual.values, [15, 15]);
      }, { count: 2 });
    }
    entry('condition-error', { breakpoint: { ...location, condition: 'missingCondition' }, observations: { value: 'price' } }, ({ hits, actual }) => {
      const hit = one(hits); assert.deepEqual(stages(hit), ['condition']);
      assert.equal(hit.observations, undefined); assert.deepEqual(actual.values, [15]);
    });
    entry('earlyReturn-value', { earlyReturn: '42' }, ({ hits, actual }) => {
      clean(hits); one(hits); assert.deepEqual(actual.values, [42]); assert.equal(actual.tail, 0);
    });
    entry('earlyReturn-after-overrides', { overrides: { price: '25' }, earlyReturn: 'price' }, ({ hits, actual }) => {
      clean(hits); one(hits); assert.deepEqual(actual.values, [25]); assert.equal(actual.tail, 0);
    });
    entry('earlyReturn-after-override-error', { overrides: { missingVariable: '25' }, earlyReturn: '42' }, ({ hits, actual }) => {
      assert.deepEqual(stages(one(hits)), ['overrides']);
      assert.deepEqual(actual.values, [42]); assert.equal(actual.tail, 0);
    });
    entry('earlyReturn-error', { earlyReturn: 'missingReturnValue' }, ({ hits, actual }) => {
      assert.deepEqual(stages(one(hits)), ['earlyReturn']); assert.deepEqual(actual.values, [15]);
    });
    entry('earlyReturn-void', { breakpoint: source(language, 'VOID'), earlyReturn: swift ? '()' : '(void)0' }, ({ hits, actual }) => {
      clean(hits); one(hits); assert.deepEqual(actual.values, ['void']); assert.equal(actual.tail, 0);
    }, { operation: `${language}Void` });
    entry('stack-only', { stack: 1 }, ({ hits, actual }) => {
      const hit = one(hits); clean(hits); assert.equal(hit.stack.length, 1);
      assert.equal(hit.observations, undefined); assert.deepEqual(actual.values, [15]);
    });
  }
  result.push({ name: 'oc/address', operation: 'oc', address: true,
    definition: { observations: { value: '1 + 1' } }, verify: ({ hits, actual }) => {
      assert.deepEqual(one(hits).observations, { value: 2 }); clean(hits); assert.deepEqual(actual.values, [15]);
    } });
  result.push({ name: 'lifecycle', lifecycle: true });
  return result;
}
