package com.agenteasyuse.mobileeasyuse.internal;

import android.os.Build;
import android.os.Debug;
import dalvik.system.BaseDexClassLoader;

/** Loads the optional ART agent only when Probe.debugger is first used. */
public final class MEUDebugger {
    private static boolean attached;

    private MEUDebugger() {}

    public static synchronized void attach() throws java.io.IOException {
        if (attached) return;
        if (Build.VERSION.SDK_INT < 28) {
            throw new UnsupportedOperationException("Probe.debugger requires Android 9 (API 28) or later");
        }
        ClassLoader loader = MEUDebugger.class.getClassLoader();
        if (!(loader instanceof BaseDexClassLoader)) {
            throw new IllegalStateException("Cannot locate the packaged JVMTI agent");
        }
        String path = ((BaseDexClassLoader) loader).findLibrary("mobile_easy_use_native");
        if (path == null) throw new IllegalStateException("The AAR does not contain libmobile_easy_use_native.so");
        Debug.attachJvmtiAgent(path, null, loader);
        attached = true;
    }
}
