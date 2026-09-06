package com.agenteasyuse.mobileeasyuse.apidemo.state;

import android.util.Log;

import androidx.annotation.Keep;

import java.util.HashMap;
import java.util.Map;

@Keep
public final class SdkFixtureState {
    private static final SdkFixtureState INSTANCE = new SdkFixtureState();
    private final Map<String, Integer> callCounts = new HashMap<>();
    private int counter;
    private String text = "initial";
    private boolean featureEnabled;

    private SdkFixtureState() {}

    public static SdkFixtureState getInstance() { return INSTANCE; }

    public synchronized int reset() {
        counter = 0;
        text = "initial";
        featureEnabled = false;
        callCounts.clear();
        return counter;
    }

    public synchronized int getCounter() { return counter; }
    public synchronized String getText() { return text; }
    public synchronized boolean isFeatureEnabled() { return featureEnabled; }
    public synchronized void setFeatureEnabled(boolean value) { featureEnabled = value; }

    public synchronized boolean featureForScope(String scope) {
        count("featureForScope");
        return featureEnabled && "enabled-scope".equals(scope);
    }

    public synchronized int getOriginalCallCount(String methodKey) {
        return callCounts.getOrDefault(methodKey, 0);
    }

    public synchronized Map<String, Integer> getOriginalCallCounts() {
        return new HashMap<>(callCounts);
    }

    public synchronized int increment() {
        count("increment");
        counter += 1;
        return counter;
    }

    public synchronized String single(String value) {
        count("single");
        text = value;
        return "single:" + value;
    }

    public static String staticValue() {
        synchronized (INSTANCE) {
            INSTANCE.count("staticValue");
        }
        return "static-original";
    }

    public synchronized String overloaded(int value) {
        count("overloaded(int)");
        return "int:" + value;
    }

    public synchronized String overloaded(String value) {
        count("overloaded(String)");
        return "string:" + value;
    }

    public synchronized String overloaded(String value, int count) {
        count("overloaded(String,int)");
        return value + ":" + count;
    }

    public synchronized void consume(String value) {
        count("consume");
        text = value;
    }

    public synchronized String throwFromFixture() {
        count("throwFromFixture");
        throw new IllegalStateException("API_DEMO_FIXTURE_THROW");
    }

    public void emitDebugLog() { Log.d("MEU.ApiDemo", "chain-debug"); }
    public void emitWarningLog() { Log.w("MEU.ApiDemo", "chain-warning"); }
    public void emitOtherTagLog() { Log.i("MEU.ApiDemo.Other", "chain-other"); }
    public void emitNoiseLog() { Log.e("MEU.ApiDemo.Noise", "chain-noise-must-be-filtered"); }

    private void count(String methodKey) {
        callCounts.put(methodKey, callCounts.getOrDefault(methodKey, 0) + 1);
    }
}
