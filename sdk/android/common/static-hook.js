import Java from 'frida-java-bridge';
import { getAndroidApiLevel, getApi, getArtThreadFromEnv } from 'frida-java-bridge/lib/android.js';

const STATIC_METHOD = 2;
const VISIBLE_INIT = '_ZN3art11ClassLinker40MakeInitializedClassesVisiblyInitializedEPNS_6ThreadEb';
let completeInitialization;

// Call inside Java.performNow, before installing a static implementation.
export function prepareStaticHook(overload) {
  if (overload.type !== STATIC_METHOD
    || !['arm', 'arm64'].includes(Process.arch) || getAndroidApiLevel() < 30) return;

  const api = getApi();
  if (!completeInitialization) {
    const address = api.find(VISIBLE_INIT);
    if (!address) {
      console.warn('[mobile-easy-use] ART visible initialization is unavailable; continuing without static Hook preparation');
      return;
    }
    completeInitialization = new NativeFunction(address, 'void', ['pointer', 'pointer', 'bool']);
  }
  const holder = overload.holder;
  Java.use('java.lang.Class').forName(holder.$className, true, holder.class.getClassLoader());
  // ARM ART batches visibility and static trampoline fixups after <clinit>.
  // Wait before Frida saves the original entry, while this JNI thread is native;
  // do not wrap this call in withRunnableArtThread (the wait must not hold its lock).
  completeInitialization(api.artClassLinker.address, getArtThreadFromEnv(Java.vm.getEnv()), 1);
}
