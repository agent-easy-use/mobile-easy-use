package com.agenteasyuse.mobileeasyuse.apidemo.state;

/** Values stay live across the marked line, including named locals and wide parameters. */
public final class DebuggerReadTypesFixture {
    public static volatile Object[] sink;
    public static volatile String result = "";
    public static volatile int hits;

    public static void readStatic(
            boolean flag,
            byte tiny,
            char letter,
            short small,
            int number,
            long wide,
            float single,
            double fraction,
            String text,
            JvmtiDebuggerFixture.Box box,
            Object nil,
            Integer boxed,
            boolean[] flags,
            byte[] bytes,
            char[] chars,
            short[] shorts,
            int[] ints,
            long[] longs,
            float[] floats,
            double[] doubles,
            String[] texts,
            int[][] matrix,
            int[] empty,
            String[] nullArray) {
        boolean localFlag = flag;
        byte localTiny = tiny;
        char localLetter = letter;
        short localSmall = small;
        int localNumber = number;
        long localWide = wide;
        float localSingle = single;
        double localFraction = fraction;
        String localText = text;
        JvmtiDebuggerFixture.Box localBox = box;
        Object localNil = nil;
        Integer localBoxed = boxed;
        boolean[] localFlags = flags;
        byte[] localBytes = bytes;
        char[] localChars = chars;
        short[] localShorts = shorts;
        int[] localInts = ints;
        long[] localLongs = longs;
        float[] localFloats = floats;
        double[] localDoubles = doubles;
        String[] localTexts = texts;
        int[][] localMatrix = matrix;
        int[] localEmpty = empty;
        String[] localNullArray = nullArray;
        hits++; // BP_READ_STATIC
        sink = new Object[] {
            localFlag, localTiny, localLetter, localSmall, localNumber, localWide, localSingle, localFraction, localText, localBox, localNil, localBoxed, localFlags, localBytes, localChars, localShorts, localInts, localLongs, localFloats, localDoubles, localTexts, localMatrix, localEmpty, localNullArray
        };
    }

    public void readInstance(
            boolean flag,
            byte tiny,
            char letter,
            short small,
            int number,
            long wide,
            float single,
            double fraction,
            String text,
            JvmtiDebuggerFixture.Box box,
            Object nil,
            Integer boxed,
            boolean[] flags,
            byte[] bytes,
            char[] chars,
            short[] shorts,
            int[] ints,
            long[] longs,
            float[] floats,
            double[] doubles,
            String[] texts,
            int[][] matrix,
            int[] empty,
            String[] nullArray) {
        boolean localFlag = flag;
        byte localTiny = tiny;
        char localLetter = letter;
        short localSmall = small;
        int localNumber = number;
        long localWide = wide;
        float localSingle = single;
        double localFraction = fraction;
        String localText = text;
        JvmtiDebuggerFixture.Box localBox = box;
        Object localNil = nil;
        Integer localBoxed = boxed;
        boolean[] localFlags = flags;
        byte[] localBytes = bytes;
        char[] localChars = chars;
        short[] localShorts = shorts;
        int[] localInts = ints;
        long[] localLongs = longs;
        float[] localFloats = floats;
        double[] localDoubles = doubles;
        String[] localTexts = texts;
        int[][] localMatrix = matrix;
        int[] localEmpty = empty;
        String[] localNullArray = nullArray;
        hits++; // BP_READ_INSTANCE
        sink = new Object[] {
            localFlag, localTiny, localLetter, localSmall, localNumber, localWide, localSingle, localFraction, localText, localBox, localNil, localBoxed, localFlags, localBytes, localChars, localShorts, localInts, localLongs, localFloats, localDoubles, localTexts, localMatrix, localEmpty, localNullArray
        };
    }

    public static void run(boolean instance) {
        result = "";
        hits = 0;
        try {
            long[] wide = {9007199254740993L, Long.MIN_VALUE, Long.MAX_VALUE, -1L, 0L};
            float[] single = {1.25f, -0.0f, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY};
            double[] fraction = {-2.5, -0.0, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY};
            byte[] tiny = {Byte.MIN_VALUE, Byte.MAX_VALUE, -1, 0, 1};
            short[] small = {Short.MIN_VALUE, Short.MAX_VALUE, -1, 0, 1};
            int[] number = {Integer.MIN_VALUE, Integer.MAX_VALUE, -1, 0, 1};
            char[] letter = {'\0', '\uffff', '中', 'A', 'B'};
            DebuggerReadTypesFixture target = new DebuggerReadTypesFixture();
            for (int i = 0; i < wide.length; i++) {
                if (instance) target.readInstance(i % 2 == 0, tiny[i], letter[i], small[i], number[i], wide[i], single[i], fraction[i],
                        "读值🙂", new JvmtiDebuggerFixture.Box(), null, Integer.valueOf(-42),
                        new boolean[]{true, false}, new byte[]{-128, 127}, new char[]{'中', 'A'},
                        new short[]{-32768, 32767}, new int[]{Integer.MIN_VALUE, Integer.MAX_VALUE},
                        new long[]{Long.MIN_VALUE, 9007199254740993L, Long.MAX_VALUE},
                        new float[]{1.25f, -0.0f, Float.NaN, Float.POSITIVE_INFINITY},
                        new double[]{-2.5, -0.0, Double.NaN, Double.NEGATIVE_INFINITY},
                        new String[]{"你好", null, ""}, new int[][]{{1, 2}, {}, {-3}}, new int[]{}, null);
                else readStatic(i % 2 == 0, tiny[i], letter[i], small[i], number[i], wide[i], single[i], fraction[i],
                        "读值🙂", new JvmtiDebuggerFixture.Box(), null, Integer.valueOf(-42),
                        new boolean[]{true, false}, new byte[]{-128, 127}, new char[]{'中', 'A'},
                        new short[]{-32768, 32767}, new int[]{Integer.MIN_VALUE, Integer.MAX_VALUE},
                        new long[]{Long.MIN_VALUE, 9007199254740993L, Long.MAX_VALUE},
                        new float[]{1.25f, -0.0f, Float.NaN, Float.POSITIVE_INFINITY},
                        new double[]{-2.5, -0.0, Double.NaN, Double.NEGATIVE_INFINITY},
                        new String[]{"你好", null, ""}, new int[][]{{1, 2}, {}, {-3}}, new int[]{}, null);
            }
            result = "ok:" + hits;
        } catch (Throwable error) { result = "ERROR:" + error; }
    }

    public static void start(boolean instance) {
        new Thread(() -> run(instance), "debugger-read-types-worker").start();
    }
}
