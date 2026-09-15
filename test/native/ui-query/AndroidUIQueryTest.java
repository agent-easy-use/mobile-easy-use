import android.view.View;
import android.view.ViewGroup;
import com.agenteasyuse.mobileeasyuse.internal.MEUUIQuery;

public class AndroidUIQueryTest {
    static class Label extends View {}
    static class CustomLabel extends Label {}

    private static View find(View root, String name) {
        return MEUUIQuery.findViewByClassName(root, name);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        ViewGroup root = new ViewGroup();
        ViewGroup branch = new ViewGroup();
        CustomLabel first = new CustomLabel();
        Label second = new Label();
        branch.addView(first);
        root.addView(branch);
        root.addView(second);

        check(find(root, View.class.getName()) == root, "includes root before descendants");
        check(find(root, Label.class.getName()) == first, "DFS child order and subclass match");
        check(find(root, CustomLabel.class.getName()) == first, "exact class and nested binary name");
        check(find(second, CustomLabel.class.getName()) == null, "base is not a subclass");
        check(find(branch, Label.class.getName()) == first, "scoped subtree");
        check(find(second, Label.class.getName()) == second, "leaf root matches");
        check(find(root, "Label") == null, "does not resolve short names");
        check(find(root, Label.class.getName().toLowerCase()) == null, "case sensitive");
        check(find(root, "missing.Type") == null, "unknown class is a miss");
        check(find(null, Label.class.getName()) == null, "missing root");
        for (String invalid : new String[] {null, ""}) {
            try {
                find(root, invalid);
                throw new AssertionError("invalid class name accepted");
            } catch (IllegalArgumentException expected) {}
        }

        ViewGroup deepRoot = new ViewGroup();
        ViewGroup current = deepRoot;
        for (int i = 0; i < 20000; i++) {
            ViewGroup next = new ViewGroup();
            current.addView(next);
            current = next;
        }
        current.addView(first);
        check(find(deepRoot, Label.class.getName()) == first, "deep tree without recursive stack overflow");
        System.out.println("Android native UI query passed");
    }
}
