package com.agenteasyuse.mobileeasyuse.internal;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** App-window screenshot bridge used by the injected JavaScript SDK. */
public final class MEUScreenshot {
    /** Implemented by Frida JavaScript through Java.registerClass(). */
    public interface ScreenshotCallback {
        void onComplete(String requestId, Map<String, Object> result);
    }

    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static final ExecutorService ENCODER = Executors.newSingleThreadExecutor();

    private MEUScreenshot() {}

    /** Returns screenshot bytes through a String boundary supported consistently by Frida. */
    public static String artifactDataBase64(Map<String, Object> artifact) {
        Object data = artifact == null ? null : artifact.get("data");
        return data instanceof byte[]
                ? Base64.encodeToString((byte[]) data, Base64.NO_WRAP)
                : "";
    }

    /**
     * Renders on the main thread, then crops and encodes on a dedicated background thread.
     */
    public static void captureAsync(
            String requestId,
            View root,
            Map<String, View> targets,
            boolean includeWindow,
            int jpegQuality,
            ScreenshotCallback callback) {
        if (callback == null) throw new IllegalArgumentException("Screenshot callback is required");
        Runnable renderTask = () -> {
            final CaptureFrame frame;
            try {
                frame = render(root, targets);
            } catch (Throwable error) {
                callback.onComplete(requestId, failure(error));
                return;
            }
            try {
                ENCODER.execute(() -> callback.onComplete(
                        requestId,
                        encode(frame, includeWindow, jpegQuality)));
            } catch (Throwable error) {
                frame.window.recycle();
                callback.onComplete(requestId, failure(error));
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) {
            renderTask.run();
        } else if (!MAIN_HANDLER.post(renderTask)) {
            callback.onComplete(requestId, failure("Failed to schedule screenshot rendering"));
        }
    }

    /** Must run on the main thread. No cropping or image encoding is performed here. */
    private static CaptureFrame render(View root, Map<String, View> targets) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            throw new IllegalStateException("Screenshot rendering must run on the main thread");
        }
        if (root == null || root.getWidth() <= 0 || root.getHeight() <= 0) {
            throw new IllegalStateException("Focused App Window has empty bounds");
        }

        Bitmap window = Bitmap.createBitmap(
                root.getWidth(), root.getHeight(), Bitmap.Config.ARGB_8888);
        try {
            root.draw(new Canvas(window));
            Map<String, Rect> targetBounds = new LinkedHashMap<>();
            int[] rootLocation = new int[2];
            root.getLocationInWindow(rootLocation);
            if (targets != null) {
                for (Map.Entry<String, View> entry : targets.entrySet()) {
                    View target = entry.getValue();
                    if (target == null || !target.isShown()
                            || target.getWidth() <= 0 || target.getHeight() <= 0) {
                        continue;
                    }
                    int[] targetLocation = new int[2];
                    target.getLocationInWindow(targetLocation);
                    Rect clipped = new Rect(
                            targetLocation[0] - rootLocation[0],
                            targetLocation[1] - rootLocation[1],
                            targetLocation[0] - rootLocation[0] + target.getWidth(),
                            targetLocation[1] - rootLocation[1] + target.getHeight());
                    if (clipped.intersect(0, 0, window.getWidth(), window.getHeight())) {
                        targetBounds.put(entry.getKey(), clipped);
                    }
                }
            }
            return new CaptureFrame(window, targetBounds);
        } catch (Throwable error) {
            window.recycle();
            throw error;
        }
    }

    /** Must not touch Views. Safe to run on the encoder thread. */
    private static Map<String, Object> encode(
            CaptureFrame frame,
            boolean includeWindow,
            int jpegQuality) {
        Bitmap window = frame.window;
        try {
            int quality = Math.max(1, Math.min(100, jpegQuality));
            List<Map<String, Object>> artifacts = new ArrayList<>();
            if (includeWindow) {
                artifacts.add(artifact("window", null, window, null, quality));
            }
            for (Map.Entry<String, Rect> entry : frame.targetBounds.entrySet()) {
                Rect bounds = entry.getValue();
                Bitmap crop = Bitmap.createBitmap(
                        window, bounds.left, bounds.top, bounds.width(), bounds.height());
                try {
                    artifacts.add(artifact("element", entry.getKey(), crop, bounds, quality));
                } finally {
                    crop.recycle();
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("captureMethod", "view-draw");
            result.put("artifacts", artifacts);
            return result;
        } catch (Throwable error) {
            return failure(error);
        } finally {
            window.recycle();
        }
    }

    private static Map<String, Object> artifact(
            String scope,
            String uiKey,
            Bitmap bitmap,
            Rect bounds,
            int quality) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)) {
            throw new IllegalStateException("JPEG compression failed");
        }
        Map<String, Object> artifact = new LinkedHashMap<>();
        artifact.put("scope", scope);
        if (uiKey != null) artifact.put("uiKey", uiKey);
        artifact.put("mimeType", "image/jpeg");
        artifact.put("width", bitmap.getWidth());
        artifact.put("height", bitmap.getHeight());
        if (bounds != null) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("x", bounds.left);
            value.put("y", bounds.top);
            value.put("width", bounds.width());
            value.put("height", bounds.height());
            artifact.put("bounds", value);
        }
        artifact.put("data", output.toByteArray());
        return artifact;
    }

    private static Map<String, Object> failure(Throwable error) {
        return failure(error.getClass().getSimpleName() + ": " + error.getMessage());
    }

    private static Map<String, Object> failure(String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", false);
        result.put("error", message == null ? "Screenshot capture failed" : message);
        result.put("artifacts", Collections.emptyList());
        return result;
    }

    private static final class CaptureFrame {
        final Bitmap window;
        final Map<String, Rect> targetBounds;

        CaptureFrame(Bitmap window, Map<String, Rect> targetBounds) {
            this.window = window;
            this.targetBounds = targetBounds;
        }
    }
}
