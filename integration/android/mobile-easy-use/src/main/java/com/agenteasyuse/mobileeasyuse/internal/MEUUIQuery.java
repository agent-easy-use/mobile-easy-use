package com.agenteasyuse.mobileeasyuse.internal;

import android.view.View;
import android.view.ViewGroup;

import java.util.ArrayDeque;

/** Native View-tree queries used by the injected JavaScript SDK. */
public final class MEUUIQuery {
    private MEUUIQuery() {}

    /**
     * Includes root, then visits descendants depth-first in child order. Matches the
     * full runtime class name or any superclass name, case-sensitively.
     * Runs on the caller's thread, like View.findViewById; use the main thread for
     * consistent UI reads. Returns null on no match. Does not require visibility.
     */
    public static View findViewByClassName(View root, String className) {
        if (className == null || className.isEmpty()) {
            throw new IllegalArgumentException("className must not be empty");
        }
        if (root == null) return null;

        ArrayDeque<View> stack = new ArrayDeque<>();
        stack.push(root);
        while (!stack.isEmpty()) {
            View view = stack.pop();
            for (Class<?> type = view.getClass(); type != null; type = type.getSuperclass()) {
                if (className.equals(type.getName())) return view;
            }
            if (view instanceof ViewGroup) {
                ViewGroup group = (ViewGroup) view;
                for (int index = group.getChildCount() - 1; index >= 0; index--) {
                    View child = group.getChildAt(index);
                    if (child != null) stack.push(child);
                }
            }
        }
        return null;
    }
}
