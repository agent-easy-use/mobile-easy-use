package com.agenteasyuse.mobileeasyuse;

/** Loads the embedded MobileEasyUse runtime once in the current App process. */
public final class MobileEasyUse {
    private static boolean loaded;

    private MobileEasyUse() {}

    /** Loads the MobileEasyUse runtime. Repeated successful calls are no-ops. */
    public static synchronized void initialize() {
        if (loaded) {
            return;
        }
        System.loadLibrary("mobile_easy_use");
        loaded = true;
    }

    /** Returns whether this process has successfully loaded the runtime through this initializer. */
    public static synchronized boolean isLoaded() {
        return loaded;
    }
}
