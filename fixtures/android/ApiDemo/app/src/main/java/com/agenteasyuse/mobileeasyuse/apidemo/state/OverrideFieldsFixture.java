package com.agenteasyuse.mobileeasyuse.apidemo.state;

import androidx.annotation.Keep;

@Keep
class OverrideFieldsBase {
    public String inheritedRegion = new String("inherited-original");
    private final String originalInheritedRegion = inheritedRegion;
    public boolean inheritedRestored() { return inheritedRegion == originalInheritedRegion; }
}

@Keep
public class OverrideFieldsFixture extends OverrideFieldsBase {
    public static boolean staticEnabled = false;
    public static String staticRegion = new String("static-original");
    private static final String originalStaticRegion = staticRegion;
    public boolean enabled = false;
    public byte variant = 1;
    public short limit = 2;
    public int mode = 2;
    public long wide = 7;
    public float ratio = 0.5f;
    public double threshold = 0.25;
    public char marker = 'A';
    public String region = new String("original-region");
    public Object policy = new Object();
    public int[] numbers = new int[] {1, 2};
    public String[] regions = new String[] {"original"};
    public Object optional = null;
    public int collision = 1;
    private final String originalRegion = region;
    private final Object originalPolicy = policy;
    private final int[] originalNumbers = numbers;
    private final String[] originalRegions = regions;

    public int collision() { return collision; }
    public boolean overridden() {
        return staticEnabled && staticRegion.equals("JP") && inheritedRegion.equals("JP") && enabled && variant == 3 && limit == 4 && mode == 3
            && wide == 9007199254740993L && ratio == 0.75f && threshold == 0.5 && marker == 'B'
            && region.equals("JP") && policy != originalPolicy && numbers[0] == 8
            && regions[0].equals("JP") && optional != null && collision == 9;
    }
    public boolean restored() {
        return !staticEnabled && staticRegion == originalStaticRegion && inheritedRestored() && !enabled && variant == 1 && limit == 2 && mode == 2
            && wide == 7 && ratio == 0.5f && threshold == 0.25 && marker == 'A'
            && region == originalRegion && policy == originalPolicy && numbers == originalNumbers
            && regions == originalRegions && optional == null && collision == 1;
    }
    public void mutate() { enabled = false; mode = 99; policy = new Object(); }
}
