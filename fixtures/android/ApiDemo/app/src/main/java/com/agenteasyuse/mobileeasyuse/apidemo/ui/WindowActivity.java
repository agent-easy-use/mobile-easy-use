package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.R;
import com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState;

import java.util.LinkedHashMap;

public final class WindowActivity extends CapabilityActivity {
    private Dialog dialog;
    private PopupWindow popup;

    @Override protected String capabilityName() { return "Window"; }
    @Override protected int rootId() { return R.id.api_window_root; }
    @Override protected int titleId() { return R.id.api_window_title; }
    @Override protected int scenarioId() { return R.id.api_window_scenario; }
    @Override protected int readyId() { return R.id.api_window_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_window_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("activity_root", "Activity DecorView root");
        target.put("dialog", "Dialog Window root");
        target.put("popup_focusable", "Focusable PopupWindow root");
        target.put("popup_nonfocusable", "Non-focusable PopupWindow root");
        target.put("no_focused_window", "Move task to background");
    }

    @Override
    protected View createFixture(String scenario) {
        LinearLayout content = UiFactory.column(this);
        content.addView(UiFactory.centeredTarget(this, "ACTIVITY_WINDOW_TARGET", R.id.api_window_activity_target));
        switch (scenario) {
            case "activity_root":
                break;
            case "dialog": {
                Button button = UiFactory.button(this, "OPEN_DIALOG", R.id.api_window_dialog);
                button.setOnClickListener(view -> openDialogFixture());
                content.addView(button);
                break;
            }
            case "popup_focusable": {
                Button button = UiFactory.button(this, "OPEN_FOCUSABLE_POPUP", R.id.api_window_popup);
                button.setOnClickListener(view -> openPopupFixture(true));
                content.addView(button);
                break;
            }
            case "popup_nonfocusable": {
                Button button = UiFactory.button(this, "OPEN_NON_FOCUSABLE_POPUP", R.id.api_window_popup);
                button.setOnClickListener(view -> openPopupFixture(false));
                content.addView(button);
                break;
            }
            case "no_focused_window": {
                Button button = UiFactory.button(this, "MOVE_TASK_TO_BACKGROUND", View.generateViewId());
                button.setOnClickListener(view -> moveTaskToBack(true));
                content.addView(button);
                break;
            }
            default: throw new IllegalArgumentException("Unknown Window scenario: " + scenario);
        }
        return content;
    }

    public void openDialogFixture() {
        if (dialog != null && dialog.isShowing()) return;
        TextView target = UiFactory.centeredTarget(this, "DIALOG_WINDOW_TARGET", R.id.api_window_dialog_target);
        target.setTag("api-dialog-target");
        dialog = new Dialog(this);
        dialog.setTitle("ApiDemo Dialog");
        dialog.setContentView(target, new ViewGroup.LayoutParams(
                UiFactory.dp(this, 300),
                UiFactory.dp(this, 180)));
        dialog.setOnDismissListener(value -> {
            ApiDemoState.getInstance().setDialogOpen(false);
            dialog = null;
        });
        dialog.show();
        ApiDemoState.getInstance().setDialogOpen(true);
    }

    public void openPopupFixture(boolean focusable) {
        if (popup != null && popup.isShowing()) return;
        TextView target = UiFactory.centeredTarget(this,
                focusable ? "FOCUSABLE_POPUP_TARGET" : "NON_FOCUSABLE_POPUP_TARGET",
                R.id.api_window_popup_target);
        target.setTag(focusable ? "api-popup-focusable" : "api-popup-nonfocusable");
        popup = new PopupWindow(
                target,
                UiFactory.dp(this, 300),
                UiFactory.dp(this, 180),
                focusable);
        popup.setBackgroundDrawable(new ColorDrawable(Color.WHITE));
        popup.setOnDismissListener(() -> {
            ApiDemoState.getInstance().setPopupOpen(false);
            popup = null;
        });
        popup.showAtLocation(findViewById(R.id.api_window_root), Gravity.CENTER, 0, 0);
        ApiDemoState.getInstance().setPopupOpen(true);
    }

    public void closeFixtureWindows() {
        if (dialog != null) dialog.dismiss();
        if (popup != null) popup.dismiss();
    }

    @Override
    protected void cleanupFixture() {
        closeFixtureWindows();
    }
}
