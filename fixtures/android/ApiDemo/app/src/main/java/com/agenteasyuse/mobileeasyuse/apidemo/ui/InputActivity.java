package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.graphics.Color;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.R;
import com.agenteasyuse.mobileeasyuse.apidemo.input.InputEventRecorder;
import com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState;
import com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState;

import java.util.LinkedHashMap;

public final class InputActivity extends CapabilityActivity {
    private View detachedView;

    @Override protected String capabilityName() { return "Input"; }
    @Override protected int rootId() { return R.id.api_input_root; }
    @Override protected int titleId() { return R.id.api_input_title; }
    @Override protected int scenarioId() { return R.id.api_input_scenario; }
    @Override protected int readyId() { return R.id.api_input_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_input_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("click", "Click and location targets");
        target.put("long_press", "Long press duration");
        target.put("text_input", "KeyCharacterMap text input");
        target.put("vertical_scroll", "Vertical ScrollView gesture");
        target.put("horizontal_scroll", "Horizontal ScrollView gesture");
        target.put("target_errors", "Hidden, zero-size, detached and offscreen targets");
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        InputEventRecorder.record(event, getScenarioKey() == null ? "catalog" : getScenarioKey());
        return super.dispatchTouchEvent(event);
    }

    @Override
    protected View createFixture(String scenario) {
        detachedView = null;
        switch (scenario) {
            case "click": return clickFixture();
            case "long_press": return longPressFixture();
            case "text_input": return textInputFixture();
            case "vertical_scroll": return verticalScrollFixture();
            case "horizontal_scroll": return horizontalScrollFixture();
            case "target_errors": return targetErrorsFixture();
            default: throw new IllegalArgumentException("Unknown Input scenario: " + scenario);
        }
    }

    @Override
    public View getDetachedFixtureView() {
        return detachedView;
    }

    private View clickFixture() {
        LinearLayout content = UiFactory.column(this);
        Button button = UiFactory.button(this, "CLICK_TARGET", R.id.api_input_click);
        button.setOnClickListener(view -> {
            ApiDemoState.getInstance().incrementClick();
            SdkFixtureState.getInstance().increment();
            SdkFixtureState.getInstance().emitDebugLog();
        });
        content.addView(button);

        TextView pad = UiFactory.centeredTarget(this, "LOCATION_TARGET", R.id.api_input_location_pad);
        pad.setOnClickListener(view -> ApiDemoState.getInstance().incrementClick());
        content.addView(pad);
        return content;
    }

    private View longPressFixture() {
        LinearLayout content = UiFactory.column(this);
        Button button = UiFactory.button(this, "LONG_PRESS_TARGET", R.id.api_input_long_press);
        button.setOnLongClickListener(view -> {
            ApiDemoState.getInstance().incrementLongPress();
            SdkFixtureState.getInstance().single("long-press");
            SdkFixtureState.getInstance().emitWarningLog();
            return true;
        });
        content.addView(button);
        return content;
    }

    private View textInputFixture() {
        LinearLayout content = UiFactory.column(this);
        EditText input = new EditText(this);
        input.setId(R.id.api_input_text);
        input.setHint("ASCII text input");
        input.setSingleLine(true);
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                ApiDemoState.getInstance().setInputText(s.toString());
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        content.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                UiFactory.dp(this, 64)));
        return content;
    }

    private View verticalScrollFixture() {
        ScrollView scroll = new ScrollView(this);
        scroll.setId(R.id.api_input_vertical_scroll);
        LinearLayout content = UiFactory.column(this);
        for (int index = 0; index < 40; index += 1) {
            content.addView(UiFactory.label(this, "VERTICAL_ROW_" + index), new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    UiFactory.dp(this, 56)));
        }
        scroll.addView(content);
        scroll.setOnScrollChangeListener((view, x, y, oldX, oldY) -> ApiDemoState.getInstance().setScroll(x, y));
        return scroll;
    }

    private View horizontalScrollFixture() {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setId(R.id.api_input_horizontal_scroll);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.HORIZONTAL);
        for (int index = 0; index < 20; index += 1) {
            TextView cell = UiFactory.label(this, "HORIZONTAL_" + index);
            cell.setGravity(android.view.Gravity.CENTER);
            cell.setBackgroundColor(index % 2 == 0 ? 0xFFE8EEFF : 0xFFDDE5FF);
            content.addView(cell, new LinearLayout.LayoutParams(
                    UiFactory.dp(this, 180),
                    ViewGroup.LayoutParams.MATCH_PARENT));
        }
        scroll.addView(content, new HorizontalScrollView.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        scroll.setOnScrollChangeListener((view, x, y, oldX, oldY) -> ApiDemoState.getInstance().setScroll(x, y));
        return scroll;
    }

    private View targetErrorsFixture() {
        FrameLayout content = new FrameLayout(this);

        TextView hidden = UiFactory.centeredTarget(this, "HIDDEN", R.id.api_input_hidden);
        hidden.setVisibility(View.INVISIBLE);
        content.addView(hidden);

        TextView zero = UiFactory.label(this, "ZERO_SIZE");
        zero.setId(R.id.api_input_zero_size);
        content.addView(zero, new FrameLayout.LayoutParams(0, 0));

        TextView partial = UiFactory.centeredTarget(this, "PARTIAL_OFFSCREEN", R.id.api_input_partial_offscreen);
        FrameLayout.LayoutParams partialParams = new FrameLayout.LayoutParams(
                UiFactory.dp(this, 260),
                UiFactory.dp(this, 80));
        partialParams.leftMargin = -UiFactory.dp(this, 100);
        partialParams.topMargin = UiFactory.dp(this, 160);
        content.addView(partial, partialParams);

        detachedView = UiFactory.centeredTarget(this, "DETACHED", View.generateViewId());
        return content;
    }
}
