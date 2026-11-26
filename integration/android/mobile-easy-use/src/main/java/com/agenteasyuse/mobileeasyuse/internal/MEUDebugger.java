package com.agenteasyuse.mobileeasyuse.internal;

import android.os.Build;
import android.os.Debug;

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
        // Let the class loader's native namespace resolve extracted and APK-backed libraries.
        // Passing only the file name avoids '=' in Android's randomized install paths.
        Debug.attachJvmtiAgent("libmobile_easy_use_native.so", null, loader);
        attached = true;
    }
}
