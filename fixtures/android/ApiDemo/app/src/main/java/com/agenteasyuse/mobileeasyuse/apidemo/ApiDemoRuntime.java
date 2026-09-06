package com.agenteasyuse.mobileeasyuse.apidemo;

import android.app.Activity;

import java.lang.reflect.Method;

public final class ApiDemoRuntime {
    private ApiDemoRuntime() {}

    public static void initializeIfRequested(Activity activity) {
        if (!activity.getIntent().getBooleanExtra("manual_init", false)) {
            return;
        }
        initialize();
    }

    public static boolean initialize() {
        try {
            Class<?> type = Class.forName("com.agenteasyuse.mobileeasyuse.MobileEasyUse");
            Method initialize = type.getMethod("initialize");
            initialize.invoke(null);
            return true;
        } catch (ClassNotFoundException error) {
            return false;
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("MobileEasyUse manual initialization failed", error);
        }
    }
}
