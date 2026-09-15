package com.agenteasyuse.mobileeasyuse.apidemo.state;

import androidx.annotation.Keep;
import java.util.concurrent.atomic.AtomicIntegerArray;

/** Isolated static Hook controls; each comparison starts in a fresh App process. */
@Keep
public final class StaticHookMatrixFixture {
    private static final AtomicIntegerArray CALLS = new AtomicIntegerArray(12);

    private StaticHookMatrixFixture() {}

    public static int calls(int index) { return CALLS.get(index); }
    public static int integer(int value) { CALLS.incrementAndGet(0); return value + 7; }
    public static boolean bool(boolean value) { CALLS.incrementAndGet(1); return !value; }
    public static long wide(long value) { CALLS.incrementAndGet(2); return value + 7; }
    public static void consume(String value) { CALLS.incrementAndGet(3); }
    public static String overloaded(int value) { CALLS.incrementAndGet(4); return "int:" + value; }
    public static String overloaded(String value) { CALLS.incrementAndGet(5); return "string:" + value; }
    public static synchronized int locked(int value) { CALLS.incrementAndGet(6); return value + 7; }
    public static int recursive(int depth) {
        if (depth < 0 || depth > 4) throw new IllegalArgumentException("depth");
        CALLS.incrementAndGet(7);
        return depth == 0 ? 1 : recursive(depth - 1) + 1;
    }
    public static String fail() {
        CALLS.incrementAndGet(8);
        throw new IllegalStateException("STATIC_MATRIX_EXPECTED");
    }

    /** No static initializer; compare with Initialized using the same method body. */
    @Keep
    public static final class Plain {
        public static int integer(int value) { CALLS.incrementAndGet(9); return value + 7; }
    }

    @Keep
    public static final class Initialized {
        public static final Object TOKEN = new Object();
        public static int integer(int value) { CALLS.incrementAndGet(10); return value + 7; }
    }

    /** Java call sites keep the trigger separate from the hooked method wrapper. */
    public static Object invoke(int index) {
        switch (index) {
            case 0: return integer(5);
            case 1: return bool(false);
            case 2: return wide(10000000000L);
            case 3: consume("probe"); return null;
            case 4: return overloaded(5);
            case 5: return overloaded("probe");
            case 6: return locked(5);
            case 7: return recursive(2);
            case 8: return fail();
            case 9: return Plain.integer(5);
            case 10: return Initialized.integer(5);
            default: throw new IllegalArgumentException("index");
        }
    }
}
