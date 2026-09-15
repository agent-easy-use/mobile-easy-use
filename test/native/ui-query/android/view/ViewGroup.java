package android.view;

import java.util.ArrayList;
import java.util.List;

public class ViewGroup extends View {
    private final List<View> children = new ArrayList<>();
    public void addView(View view) { children.add(view); }
    public int getChildCount() { return children.size(); }
    public View getChildAt(int index) { return children.get(index); }
}
