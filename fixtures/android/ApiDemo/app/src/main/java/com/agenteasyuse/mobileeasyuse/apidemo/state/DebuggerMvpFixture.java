package com.agenteasyuse.mobileeasyuse.apidemo.state;

import java.lang.reflect.Array;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/** Business-side checks for the current SDK debugger, driven from a worker thread.
 * Typed copy calls keep locals distinct from argument registers in the debug build. */
public final class DebuggerMvpFixture {
    public static volatile String result = "";
    public static volatile Object consumed;
    public static final AtomicInteger tail = new AtomicInteger();
    public static final AtomicInteger finalized = new AtomicInteger();
    private static volatile CountDownLatch gate = new CountDownLatch(1);
    public static volatile boolean entered;

    public static void reset() {
        result = "";
        consumed = null;
        tail.set(0);
        finalized.set(0);
        entered = false;
        gate = new CountDownLatch(1);
    }
    public static void awaitGate() throws InterruptedException {
        entered = true;
        if (!gate.await(15, java.util.concurrent.TimeUnit.SECONDS)) {
            throw new IllegalStateException("fixture gate timed out");
        }
    }
    public static void releaseGate() { gate.countDown(); }
    public static String describe(Object value) {
        if (value == null) return "null";
        if (value instanceof Character) return Integer.toString((Character) value);
        if (value instanceof Float) return "bits:" + Integer.toHexString(Float.floatToRawIntBits((Float) value));
        if (value instanceof Double) return "bits:" + Long.toHexString(Double.doubleToRawLongBits((Double) value));
        if (value instanceof JvmtiDebuggerFixture.Box) return ((JvmtiDebuggerFixture.Box) value).label;
        if (value.getClass().isArray()) {
            JSONArray items = new JSONArray();
            for (int i = 0; i < Array.getLength(value); i++) items.put(describe(Array.get(value, i)));
            return items.toString();
        }
        return value.toString();
    }

    private static boolean copyBoolean(boolean value) { return value; }

    public static boolean typeBoolean(boolean value) {
        boolean local = copyBoolean(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Boolean
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static byte copyByte(byte value) { return value; }

    public static byte typeByte(byte value) {
        byte local = copyByte(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Byte
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static char copyChar(char value) { return value; }

    public static char typeChar(char value) {
        char local = copyChar(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Char
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static short copyShort(short value) { return value; }

    public static short typeShort(short value) {
        short local = copyShort(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Short
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static int copyInt(int value) { return value; }

    public static int typeInt(int value) {
        int local = copyInt(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Int
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static long copyLong(long value) { return value; }

    public static long typeLong(long value) {
        long local = copyLong(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Long
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static float copyFloat(float value) { return value; }

    public static float typeFloat(float value) {
        float local = copyFloat(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Float
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static double copyDouble(double value) { return value; }

    public static double typeDouble(double value) {
        double local = copyDouble(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Double
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static String copyString(String value) { return value; }

    public static String typeString(String value) {
        String local = copyString(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_String
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static JvmtiDebuggerFixture.Box copyObject(JvmtiDebuggerFixture.Box value) { return value; }

    public static JvmtiDebuggerFixture.Box typeObject(JvmtiDebuggerFixture.Box value) {
        JvmtiDebuggerFixture.Box local = copyObject(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Object
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static boolean[] copyBooleans(boolean[] value) { return value; }

    public static boolean[] typeBooleans(boolean[] value) {
        boolean[] local = copyBooleans(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Booleans
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static byte[] copyBytes(byte[] value) { return value; }

    public static byte[] typeBytes(byte[] value) {
        byte[] local = copyBytes(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Bytes
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static char[] copyChars(char[] value) { return value; }

    public static char[] typeChars(char[] value) {
        char[] local = copyChars(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Chars
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static short[] copyShorts(short[] value) { return value; }

    public static short[] typeShorts(short[] value) {
        short[] local = copyShorts(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Shorts
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static int[] copyInts(int[] value) { return value; }

    public static int[] typeInts(int[] value) {
        int[] local = copyInts(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Ints
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static long[] copyLongs(long[] value) { return value; }

    public static long[] typeLongs(long[] value) {
        long[] local = copyLongs(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Longs
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static float[] copyFloats(float[] value) { return value; }

    public static float[] typeFloats(float[] value) {
        float[] local = copyFloats(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Floats
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static double[] copyDoubles(double[] value) { return value; }

    public static double[] typeDoubles(double[] value) {
        double[] local = copyDoubles(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Doubles
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static String[] copyStrings(String[] value) { return value; }

    public static String[] typeStrings(String[] value) {
        String[] local = copyStrings(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Strings
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    private static int[][] copyMatrix(int[][] value) { return value; }

    public static int[][] typeMatrix(int[][] value) {
        int[][] local = copyMatrix(value);
        try {
            tail.incrementAndGet(); // BP_TYPE_Matrix
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }

    public static void typeVoid() {
        try {
            tail.incrementAndGet(); // BP_TYPE_Void
        } finally { finalized.incrementAndGet(); }
    }
    public static int sequence(int input) {
        int local = input + 10;
        try {
            tail.incrementAndGet(); // BP_SEQUENCE
            return input + local; // BP_SEQUENCE_RETURN
        } finally { finalized.incrementAndGet(); }
    }
    public static int sameLineLocations(int value) {
        try {
            return value + 1; // BP_MULTI_LOCATION
        } finally {
            finalized.incrementAndGet();
        }
    }
    public static int overloaded(int value) {
        tail.incrementAndGet(); // BP_OVERLOAD_INT
        return value;
    }
    public static String overloaded(String value) { return value; }
    public static int scoped(boolean first) {
        if (first) {
            int local = 11;
            tail.incrementAndGet(); // BP_SCOPE_FIRST
            return local;
        } else {
            int local = 22;
            tail.incrementAndGet(); // BP_SCOPE_SECOND
            return local;
        }
    }
    private static String copyTextString(String value) { return value; }
    public static String textString(String value) {
        String local = copyTextString(value);
        try {
            tail.incrementAndGet(); // BP_TEXT_String
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }
    private static Object copyTextObject(Object value) { return value; }
    public static Object textObject(Object value) {
        Object local = copyTextObject(value);
        try {
            tail.incrementAndGet(); // BP_TEXT_Object
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }
    private static CharSequence copyTextCharSequence(CharSequence value) { return value; }
    public static CharSequence textCharSequence(CharSequence value) {
        CharSequence local = copyTextCharSequence(value);
        try {
            tail.incrementAndGet(); // BP_TEXT_CharSequence
            consumed = local;
            return value;
        } finally { finalized.incrementAndGet(); }
    }
    private static int caller2(int value) { return sequence(value); }
    private static int caller1(int value) { return caller2(value); }

    public static class Parent {
        private int inherited = 30;
        public int hidden = 40;
        public int parentRead() {
            int local = copyInt(1);
            tail.incrementAndGet(); // BP_PARENT
            return hidden + local;
        }
    }
    public static class Counter extends Parent {
        private int count = 100;
        public int amount = 200;
        public int hidden = 50;
        public String text = "old";
        public boolean flag = false;
        public int[] items = {7};
        public int amount() { return amount; } // Field/method collision must not affect lookup.
        public int update(int count) throws Exception {
            int local = copyInt(2);
            try {
                tail.incrementAndGet(); // BP_NAMES
                consumed = new JSONObject().put("argument", count).put("local", local)
                        .put("field", this.count).put("amount", amount).put("inherited", ((Parent)this).inherited)
                        .put("text", text).put("flag", flag).put("items", describe(items)).toString();
                return count + local + this.count + amount + ((Parent)this).inherited;
            } finally { finalized.incrementAndGet(); }
        }
        public int scoped() {
            { int count = copyInt(2);
                tail.incrementAndGet(); // BP_FIELD_SCOPE_IN
                consumed = count;
            }
            tail.incrementAndGet(); // BP_FIELD_SCOPE_OUT
            return count;
        }
    }

    public static class Conversions {
        public Counter concrete = new Counter();
        public Parent parent = concrete;
        public Object object = concrete;
        public Parent[] objects = {parent, null};
        public Parent[][] nested = {objects, null};
        public int[] ints = {1, 2};
        public String[] names = {"old", null};
        public String run() throws Exception {
            Counter concrete = this.concrete;
            Parent parent = this.parent;
            Object object = this.object;
            Parent[] objects = this.objects;
            Parent[][] nested = this.nested;
            int[] ints = this.ints;
            String[] names = this.names;
            tail.incrementAndGet(); // BP_CONVERSIONS
            return new JSONObject().put("ints", describe(ints)).put("names", describe(names))
                    .put("hidden", parent.hidden).put("amount", concrete.amount)
                    .put("same", object == concrete && objects[0] == parent && nested[0][0] == parent).toString();
        }
    }

    // Exercise the field JNI entry points independently from local-variable access.
    public static class FieldTypes {
        public boolean fieldBoolean = false;
        public byte fieldByte = 7;
        public char fieldChar = 'x';
        public short fieldShort = 7;
        public int fieldInt = 7;
        public long fieldLong = 7L;
        public float fieldFloat = 7.0f;
        public double fieldDouble = 7.0;
        public String fieldString = "old";
        public JvmtiDebuggerFixture.Box fieldObject = new JvmtiDebuggerFixture.Box();
        public boolean[] fieldBooleans = new boolean[]{false};
        public byte[] fieldBytes = new byte[]{7};
        public char[] fieldChars = new char[]{'x'};
        public short[] fieldShorts = new short[]{7};
        public int[] fieldInts = new int[]{7};
        public long[] fieldLongs = new long[]{7L};
        public float[] fieldFloats = new float[]{7.0f};
        public double[] fieldDoubles = new double[]{7.0};
        public String[] fieldStrings = new String[]{"old"};
        public int[][] fieldMatrix = new int[][]{{7}};
        public String read(String type) {
            tail.incrementAndGet(); // BP_FIELD_TYPES
            switch (type) {
                case "Boolean": return describe(fieldBoolean);
                case "Byte": return describe(fieldByte);
                case "Char": return describe(fieldChar);
                case "Short": return describe(fieldShort);
                case "Int": return describe(fieldInt);
                case "Long": return describe(fieldLong);
                case "Float": return describe(fieldFloat);
                case "Double": return describe(fieldDouble);
                case "String": return describe(fieldString);
                case "Object": return describe(fieldObject);
                case "Booleans": return describe(fieldBooleans);
                case "Bytes": return describe(fieldBytes);
                case "Chars": return describe(fieldChars);
                case "Shorts": return describe(fieldShorts);
                case "Ints": return describe(fieldInts);
                case "Longs": return describe(fieldLongs);
                case "Floats": return describe(fieldFloats);
                case "Doubles": return describe(fieldDoubles);
                case "Strings": return describe(fieldStrings);
                case "Matrix": return describe(fieldMatrix);
                default: throw new IllegalArgumentException(type);
            }
        }
    }

    public static void start(String mode, int count) {
        new Thread(() -> run(mode, count), "debugger-mvp-worker").start();
    }

    public static void run(String mode, int count) {
        try {
            JSONArray values = new JSONArray();
            JSONArray locals = new JSONArray();
            if (mode.equals("concurrent")) {
                Thread[] workers = new Thread[4];
                java.util.List<Throwable> errors = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
                for (int w = 0; w < workers.length; w++) {
                    final int offset = w * count;
                    workers[w] = new Thread(() -> {
                        try {
                            for (int i = 0; i < count; i++) {
                                int value = caller1(offset + i + 1);
                                synchronized (values) { values.put(Integer.toString(value)); }
                            }
                        } catch (Throwable error) { errors.add(error); }
                    }, "debugger-mvp-" + w);
                    workers[w].start();
                }
                for (Thread worker : workers) worker.join();
                if (!errors.isEmpty()) throw new RuntimeException(errors.get(0));
            } else {
                for (int i = 0; i < count; i++) {
                    Object value;
                    String[] texts = {"", "中文", "emoji🙂", null};
                    switch (mode) {
                        case "nullString": value = textString(null); break;
                        case "nullObject": value = textObject(null); break;
                        case "nullCharSequence": value = textCharSequence(null); break;
                        case "textString": value = textString(texts[i]); break;
                        case "textObject": value = textObject(texts[i]); break;
                        case "textCharSequence": value = textCharSequence(texts[i]); break;
                        case "textBuilder": value = textCharSequence(new StringBuilder("builder")); break;
                        case "noLocals": value = new DebuggerNoLocalsFixture().call(3); break;
                        case "fieldBoolean": value = new FieldTypes().read("Boolean"); break;
                        case "fieldByte": value = new FieldTypes().read("Byte"); break;
                        case "fieldChar": value = new FieldTypes().read("Char"); break;
                        case "fieldShort": value = new FieldTypes().read("Short"); break;
                        case "fieldInt": value = new FieldTypes().read("Int"); break;
                        case "fieldLong": value = new FieldTypes().read("Long"); break;
                        case "fieldFloat": value = new FieldTypes().read("Float"); break;
                        case "fieldDouble": value = new FieldTypes().read("Double"); break;
                        case "fieldString": value = new FieldTypes().read("String"); break;
                        case "fieldObject": value = new FieldTypes().read("Object"); break;
                        case "fieldBooleans": value = new FieldTypes().read("Booleans"); break;
                        case "fieldBytes": value = new FieldTypes().read("Bytes"); break;
                        case "fieldChars": value = new FieldTypes().read("Chars"); break;
                        case "fieldShorts": value = new FieldTypes().read("Shorts"); break;
                        case "fieldInts": value = new FieldTypes().read("Ints"); break;
                        case "fieldLongs": value = new FieldTypes().read("Longs"); break;
                        case "fieldFloats": value = new FieldTypes().read("Floats"); break;
                        case "fieldDoubles": value = new FieldTypes().read("Doubles"); break;
                        case "fieldStrings": value = new FieldTypes().read("Strings"); break;
                        case "fieldMatrix": value = new FieldTypes().read("Matrix"); break;
                        case "names": value = new Counter().update(3); break;
                        case "parent": value = new Counter().parentRead(); break;
                        case "fieldScope": value = new Counter().scoped(); break;
                        case "typeBoolean": value = typeBoolean(false); break;
                        case "typeByte": value = typeByte((byte) 7); break;
                        case "typeChar": value = typeChar('x'); break;
                        case "typeShort": value = typeShort((short) 7); break;
                        case "typeInt": value = typeInt(7); break;
                        case "typeLong": value = typeLong(7L); break;
                        case "typeFloat": value = typeFloat(7.0f); break;
                        case "typeDouble": value = typeDouble(7.0); break;
                        case "typeString": value = typeString("old"); break;
                        case "typeObject": value = typeObject(new JvmtiDebuggerFixture.Box()); break;
                        case "typeBooleans": value = typeBooleans(new boolean[]{false}); break;
                        case "typeBytes": value = typeBytes(new byte[]{7}); break;
                        case "typeChars": value = typeChars(new char[]{'x'}); break;
                        case "typeShorts": value = typeShorts(new short[]{7}); break;
                        case "typeInts": value = typeInts(new int[]{7}); break;
                        case "typeLongs": value = typeLongs(new long[]{7L}); break;
                        case "typeFloats": value = typeFloats(new float[]{7.0f}); break;
                        case "typeDoubles": value = typeDoubles(new double[]{7.0}); break;
                        case "typeStrings": value = typeStrings(new String[]{"old"}); break;
                        case "typeMatrix": value = typeMatrix(new int[][]{{7}}); break;
                        case "conversions": value = new Conversions().run(); break;
                        case "typeVoid": typeVoid(); value = "void"; break;
                        case "overloaded": value = overloaded(i + 1); break;
                        case "scoped": value = scoped(i % 2 == 0); break;
                        case "sameLineLocations": value = sameLineLocations(i + 2); break;
                        case "multipleDifferent": value = sequence(i + 1) + overloaded(i + 1); break;
                        case "kotlin": value = JvmtiTopLevelKt.topLevelCompute(i + 1, new JvmtiDebuggerFixture.Box(), 10000000003L, 2.5); break;
                        default: value = caller1(i + 1); break;
                    }
                    values.put(describe(value));
                    locals.put(describe(consumed));
                }
            }
            result = new JSONObject().put("values", values).put("locals", locals)
                    .put("tail", tail.get()).put("finally", finalized.get()).toString();
        } catch (Throwable error) { result = "ERROR:" + error; }
    }
}
