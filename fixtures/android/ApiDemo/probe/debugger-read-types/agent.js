import Java from 'frida-java-bridge';
import { code } from '../../../../../sdk/android/inspect/code.js';

import { snapshot } from '../../../../../sdk/android/common/debugger/native.js';

const target = 'com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerReadTypesFixture';
const names = ['flag', 'tiny', 'letter', 'small', 'number', 'wide', 'single', 'fraction',
  'text', 'box', 'nil', 'boxed', 'flags', 'bytes', 'chars', 'shorts', 'ints', 'longs',
  'floats', 'doubles', 'texts', 'matrix', 'empty', 'nullArray'];
let watcher;

rpc.exports = {
  async configure(instance, fileLine) {
    Java.performNow(() => { Java.use(target).result.value = ''; });
    const capture = {};
    for (const kind of ['argument', 'local']) {
      const variable = name => kind === 'argument' ? name : 'local' + name[0].toUpperCase() + name.slice(1);
      for (const name of names) capture[kind + '.' + name] = ({ get }) => snapshot(get(variable(name)));
      capture[kind + '.inspect'] = ({get}) => {
          const values = Object.fromEntries(names.map(name => [name, get(variable(name))]));
          function contents(array) {
            return Array.from({length: array.length}, (_, i) => {
              const item = array[i];
              if (item === null) return null;
              return Array.isArray(item) || (item.$h && item.length !== undefined)
                ? contents(item) : Object.is(item, -0) ? '-0.0' : String(item);
            });
          }
          const arrays = {};
          for (const name of names.slice(12, 23)) arrays[name] = contents(values[name]);
          return {
            arrays,
            text: values.text,
            boxVersion: values.box.config.value.version.value.toString(),
            boxCall: values.box.read().toString(),
            boxed: values.boxed.intValue(),
            nil: values.nil,
            nullArray: values.nullArray,
            negativeZeroFloat: Object.is(values.single, -0),
            negativeZeroDouble: Object.is(values.fraction, -0),
          };
      };
    }
    watcher = await code.watch({ className: target, method: instance ? 'readInstance' : 'readStatic', fileLine }, { capture });
  },
  trigger(instance) {
    Java.performNow(() => { Java.use(target).start(instance); });
  },
  poll() {
    let result;
    Java.performNow(() => { result = Java.use(target).result.value; });
    return result;
  },
  async stop() {
    if (!watcher) return [];
    const result = await watcher.stop();
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
};
