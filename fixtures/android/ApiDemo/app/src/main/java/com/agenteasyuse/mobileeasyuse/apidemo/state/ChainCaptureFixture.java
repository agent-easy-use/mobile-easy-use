package com.agenteasyuse.mobileeasyuse.apidemo.state;

import android.os.SystemClock;
import androidx.annotation.Keep;

/** Bounded, deterministic business operations for real-runtime capture tests. */
@Keep
public final class ChainCaptureFixture {
    private static final ChainCaptureFixture INSTANCE = new ChainCaptureFixture();
    private byte[] retained;
    private int calls;
    private ChainCaptureFixture() {}
    public static ChainCaptureFixture getInstance() { return INSTANCE; }
    public synchronized void reset() { retained = null; calls = 0; }
    public synchronized int getCalls() { return calls; }
    public synchronized int getRetainedBytes() { return retained == null ? 0 : retained.length; }
    public synchronized String work(String key, int bytes, int delayMs) {
        if (bytes < 0 || bytes > 1048576 || delayMs < 0 || delayMs > 50) {
            throw new IllegalArgumentException("fixture bounds");
        }
        calls++;
        retained = new byte[bytes];
        for (int i = 0; i < bytes; i += 4096) retained[i] = 1;
        SystemClock.sleep(delayMs);
        return key + ":" + bytes;
    }
    public synchronized String fail(String key) {
        calls++;
        throw new IllegalStateException("CHAIN_CAPTURE_FAILURE:" + key);
    }
    public synchronized int recursive(int depth) {
        if (depth < 0 || depth > 4) throw new IllegalArgumentException("depth bounds");
        calls++;
        return depth == 0 ? 1 : recursive(depth - 1) + 1;
    }
    public synchronized String plain(String key) { calls++; return "plain:" + key; }

    private volatile int workersDone;
    private volatile int workersPeak;
    private int workersActive;
    private final java.util.List<Integer> workerResults = new java.util.ArrayList<>();
    public synchronized int getWorkersDone() { return workersDone; }
    public synchronized int getWorkersPeak() { return workersPeak; }
    public synchronized String getWorkerResults() { return workerResults.toString(); }
    public void startWorkers() {
        synchronized (this) { workersDone = 0; workersPeak = 0; workersActive = 0; workerResults.clear(); }
        java.util.concurrent.CountDownLatch gate = new java.util.concurrent.CountDownLatch(1);
        for (int id = 1; id <= 2; id++) {
            final int workerId = id;
            new Thread(() -> {
                try { gate.await(); int result = worker(workerId);
                    synchronized (this) { workerResults.add(result); }
                } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
                finally { synchronized (this) { workersDone++; } }
            }, "capture-w" + id).start();
        }
        gate.countDown();
    }
    public int worker(int id) {
        synchronized (this) { calls++; workersActive++; workersPeak = Math.max(workersPeak, workersActive); }
        android.util.Log.i("MEU.Context", "worker:" + id);
        try { SystemClock.sleep(50); return id * 10; }
        finally { synchronized (this) { workersActive--; } }
    }
    private volatile boolean contextMainDone;
    private volatile int contextMainResult;
    public boolean isContextMainDone() { return contextMainDone; }
    public int getContextMainResult() { return contextMainResult; }
    public void startContextMain() {
        contextMainDone = false;
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            Thread thread = Thread.currentThread();
            String previous = thread.getName();
            try { thread.setName("capture-main"); contextMainResult = contextLeaf(); }
            finally { thread.setName(previous); contextMainDone = true; }
        });
    }
    public int contextDepth(int depth) {
        if (depth < 0 || depth > 12) throw new IllegalArgumentException("depth");
        return depth == 0 ? contextLeaf() : contextDepth(depth - 1) + 1;
    }
    public synchronized int contextLeaf() {
        calls++;
        android.util.Log.i("MEU.Context", "leaf");
        return 7;
    }
    public synchronized String nullable(String value) { calls++; return value; }
    public synchronized boolean booleanValue(boolean value) { calls++; return value; }
    public synchronized long wideValue(long value) { calls++; return value; }
    public synchronized void consume(String value) { calls++; }
    public synchronized String overloaded(int value) { calls++; return "int:" + value; }
    public synchronized String overloaded(String value) { calls++; return "string:" + value; }
    public boolean exerciseScalars() {
        return !booleanValue(false) && wideValue(Long.MIN_VALUE) == Long.MIN_VALUE
                && nullable(null) == null;
    }
}
