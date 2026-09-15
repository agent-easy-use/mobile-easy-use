package com.agenteasyuse.mobileeasyuse.apidemo.state;

import androidx.annotation.Keep;

/** Kept separate so navigation cannot initialize or warm the target before the probe. */
@Keep
public final class StaticResolutionFixture {
    private static final StaticResolutionFixture INSTANCE = new StaticResolutionFixture();
    private int calls;

    private StaticResolutionFixture() {}

    public static int getCalls() { return INSTANCE.calls; }

    public static String target(String value) {
        INSTANCE.calls++;
        return "original:" + value;
    }

    /** A Java call site, distinct from invoking the hooked wrapper from JavaScript. */
    public static String invokeTarget(String value) { return target(value); }
}
