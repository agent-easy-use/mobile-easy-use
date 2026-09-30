package com.agenteasyuse.mobileeasyuse.apidemo.state;

import org.json.JSONObject;

public final class JvmtiDebuggerFixture {
    public static volatile String result = "";
    public static volatile int tailCount, finallyCount;
    public static final class Box {
        public final Config config = new Config();
        public String label = "original";
        public String read() { return config.version; }
    }
    public static final class Config { public String version = "jvmti-frida"; }

    public static int compute(int input, Box box, long wide, double fraction) {
        int local = input + 10;
        try {
            tailCount++; // BP_COMPUTE
            return local + input + (int) wide + (int) fraction + box.label.length();
        } finally {
            finallyCount++;
        }
    }
    public int computeInstance(int input, Box box, long wide, double fraction) {
        int local = input + 10;
        try {
            tailCount++; // BP_INSTANCE
            return local + input + (int) wide + (int) fraction + box.label.length();
        } finally {
            finallyCount++;
        }
    }
    public static String objectResult(Box box) {
        tailCount++; // BP_OBJECT
        return box.label;
    }
    public static void voidResult() {
        tailCount++; // BP_VOID
    }
    public static synchronized void run(String mode, int count) {
        result = "";
        tailCount = finallyCount = 0;
        try {
            org.json.JSONArray values = new org.json.JSONArray();
            if (mode.equals("concurrent")) {
                Thread[] workers = new Thread[4];
                for (int w = 0; w < workers.length; w++) {
                    final int offset = w * count;
                    workers[w] = new Thread(() -> {
                        for (int i = 0; i < count; i++) {
                            int value = compute(offset + i + 1, new Box(), 10000000003L, 2.5);
                            synchronized (values) { values.put(value); }
                        }
                    }, "jvmti-concurrent-" + w);
                    workers[w].start();
                }
                for (Thread worker : workers) worker.join();
                result = new JSONObject().put("values", values).toString();
                return;
            }
            for (int i = 0; i < count; i++) {
                Box box = new Box();
                if (mode.equals("object")) values.put(objectResult(box));
                else if (mode.equals("void")) { voidResult(); values.put("void"); }
                else if (mode.equals("instance")) values.put(new JvmtiDebuggerFixture().computeInstance(i + 1, box, 10000000003L, 2.5));
                else if (mode.equals("kotlin")) values.put(JvmtiTopLevelKt.topLevelCompute(i + 1, box, 10000000003L, 2.5));
                else values.put(compute(i + 1, box, 10000000003L, 2.5));
            }
            result = new JSONObject().put("values", values).put("tail", tailCount)
                    .put("finally", finallyCount).toString();
        } catch (Throwable t) { result = "ERROR:" + t; }
    }
}
