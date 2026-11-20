import Java from 'frida-java-bridge';
import source from '../../../../app/src/main/java/com/agenteasyuse/mobileeasyuse/apidemo/state/DebuggerMvpFixture.java';

export const className = 'com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerMvpFixture';
export function breakpoint(method = 'sequence', marker = 'BP_SEQUENCE', owner = className) {
  const matches = source.split('\n').flatMap((line, i) => line.trimEnd().endsWith(`// ${marker}`) ? [i + 1] : []);
  if (matches.length !== 1) throw new Error(`Expected one source marker: ${marker}`);
  return { target: owner, method, fileLine: matches[0] };
}
export function reset() {
  Java.performNow(() => Java.use(className).reset());
}
export async function runNative(mode = 'sequence', count = 1) {
  // Trigger business code on a Java worker; never block Frida waiting for a breakpoint callback.
  Java.performNow(() => Java.use(className).start(mode, count));
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    let result;
    Java.performNow(() => { result = String(Java.use(className).result.value); });
    if (result) {
      if (result.startsWith('ERROR:')) throw new Error(result);
      return JSON.parse(result);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Debugger fixture did not finish');
}
