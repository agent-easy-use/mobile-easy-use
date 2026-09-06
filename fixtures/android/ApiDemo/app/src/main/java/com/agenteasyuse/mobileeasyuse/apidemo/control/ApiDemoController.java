package com.agenteasyuse.mobileeasyuse.apidemo.control;

import android.os.Looper;
import android.content.Intent;
import android.view.View;

import androidx.annotation.Keep;

import com.agenteasyuse.mobileeasyuse.apidemo.ApiDemoRuntime;
import com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState;
import com.agenteasyuse.mobileeasyuse.apidemo.ui.CapabilityActivity;
import com.agenteasyuse.mobileeasyuse.apidemo.ui.MainActivity;
import com.agenteasyuse.mobileeasyuse.apidemo.ui.WindowActivity;

import java.lang.ref.WeakReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@Keep
public final class ApiDemoController {
    private static WeakReference<CapabilityActivity> current = new WeakReference<>(null);

    private ApiDemoController() {}

    public static synchronized void register(CapabilityActivity activity) {
        current = new WeakReference<>(activity);
    }

    public static synchronized void unregister(CapabilityActivity activity) {
        if (current.get() == activity) {
            current.clear();
        }
    }

    public static int reset() {
        return onMain(() -> requireActivity().resetCurrentScenario());
    }

    public static int getGeneration() {
        return ApiDemoState.getInstance().getGeneration();
    }

    public static String getActivity() {
        return ApiDemoState.getInstance().getActivity();
    }

    public static String getScenario() {
        return ApiDemoState.getInstance().getScenario();
    }

    public static View getDetachedView() {
        return onMain(() -> requireActivity().getDetachedFixtureView());
    }

    public static boolean initializeRuntime() {
        return ApiDemoRuntime.initialize();
    }

    public static void showAfter(String fixtureKey, long delayMs) {
        onMain(() -> {
            requireActivity().scheduleFixtureAction(fixtureKey, "show", delayMs);
            return null;
        });
    }

    public static void hideAfter(String fixtureKey, long delayMs) {
        onMain(() -> {
            requireActivity().scheduleFixtureAction(fixtureKey, "hide", delayMs);
            return null;
        });
    }

    public static void attachAfter(String fixtureKey, long delayMs) {
        onMain(() -> {
            requireActivity().scheduleFixtureAction(fixtureKey, "attach", delayMs);
            return null;
        });
    }

    public static void detachAfter(String fixtureKey, long delayMs) {
        onMain(() -> {
            requireActivity().scheduleFixtureAction(fixtureKey, "detach", delayMs);
            return null;
        });
    }

    public static void resizeAfter(String fixtureKey, long delayMs) {
        onMain(() -> {
            requireActivity().scheduleFixtureAction(fixtureKey, "resize", delayMs);
            return null;
        });
    }

    public static void openDialog() {
        onMain(() -> {
            requireWindowActivity().openDialogFixture();
            return null;
        });
    }

    public static void openPopup(boolean focusable) {
        onMain(() -> {
            requireWindowActivity().openPopupFixture(focusable);
            return null;
        });
    }

    public static void closeWindows() {
        onMain(() -> {
            requireWindowActivity().closeFixtureWindows();
            return null;
        });
    }

    public static void moveTaskToBack() {
        onMain(() -> {
            requireActivity().moveTaskToBack(true);
            return null;
        });
    }

    public static void returnToMain() {
        onMain(() -> {
            CapabilityActivity activity = requireActivity();
            Intent intent = new Intent(activity, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            activity.startActivity(intent);
            activity.finish();
            return null;
        });
    }

    private static synchronized CapabilityActivity requireActivity() {
        CapabilityActivity activity = current.get();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            throw new IllegalStateException("ApiDemo capability Activity is unavailable");
        }
        return activity;
    }

    private static WindowActivity requireWindowActivity() {
        CapabilityActivity activity = requireActivity();
        if (!(activity instanceof WindowActivity)) {
            throw new IllegalStateException("WindowActivity is not active");
        }
        return (WindowActivity) activity;
    }

    private interface MainWork<T> { T run(); }

    private static <T> T onMain(MainWork<T> work) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            return work.run();
        }
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<T> result = new AtomicReference<>();
        AtomicReference<RuntimeException> failure = new AtomicReference<>();
        requireActivity().runOnUiThread(() -> {
            try {
                result.set(work.run());
            } catch (RuntimeException error) {
                failure.set(error);
            } finally {
                latch.countDown();
            }
        });
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("ApiDemo main-thread operation timed out");
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("ApiDemo main-thread operation interrupted", error);
        }
        if (failure.get() != null) {
            throw failure.get();
        }
        return result.get();
    }
}
