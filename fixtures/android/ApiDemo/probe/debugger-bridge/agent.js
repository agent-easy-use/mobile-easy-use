import Java from 'frida-java-bridge';
import { prepareStaticHook } from '../../../../../sdk/android/common/static-hook.js';

Java.perform(() => {
  const Fixture = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerBridgeFixture');
  Fixture.$new(); // Ensure the breakpoint class is loaded/prepared before JDI attaches.
  const Bridge = Java.use('com.agenteasyuse.mobileeasyuse.apidemo.state.AgentBridge');
  const inspect = Bridge.inspect.overload('java.lang.Object', 'java.lang.String');
  prepareStaticHook(inspect);
  let calls = 0;
  inspect.implementation = function (target, expression) {
    const path = expression.toString();
    let value = target;
    for (const segment of path.split('.')) {
      value = Java.cast(value, Java.use(value.getClass().getName().toString()));
      if (/^[a-zA-Z_$][\w$]*\(\)$/.test(segment)) {
        value = value[segment.slice(0, -2)].overload().call(value);
      } else if (/^[a-zA-Z_$][\w$]*$/.test(segment)) {
        value = value[segment].value;
      } else {
        throw new Error('Unsupported proof path: ' + segment);
      }
    }
    const result = {
      handledBy: 'frida', call: ++calls, expression: path,
      value: value === null ? null : value.toString(),
      targetClass: target.getClass().getName().toString(),
      thread: Java.use('java.lang.Thread').currentThread().getName().toString()
    };
    send({ event: 'inspect', ...result });
    return JSON.stringify(result);
  };
  send({ event: 'ready' });
});
