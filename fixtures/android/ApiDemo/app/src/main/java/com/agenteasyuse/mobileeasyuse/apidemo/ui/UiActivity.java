package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.R;
import com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState;

import java.util.LinkedHashMap;

public final class UiActivity extends CapabilityActivity {
    @Override protected String capabilityName() { return "UI"; }
    @Override protected int rootId() { return R.id.api_ui_root; }
    @Override protected int titleId() { return R.id.api_ui_title; }
    @Override protected int scenarioId() { return R.id.api_ui_scenario; }
    @Override protected int readyId() { return R.id.api_ui_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_ui_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("resource_id", "Resource ID and Java action");
        target.put("path", "ID, text, tag and descendant path");
        target.put("visibility", "Hidden, gone, disabled and zero-size Views");
        target.put("runtime_wrapper", "Concrete runtime View wrapper");
    }

    @Override
    protected View createFixture(String scenario) {
        switch (scenario) {
            case "resource_id": return resourceFixture();
            case "path": return pathFixture();
            case "visibility": return visibilityFixture();
            case "runtime_wrapper": return runtimeWrapperFixture();
            default: throw new IllegalArgumentException("Unknown UI scenario: " + scenario);
        }
    }

    private View resourceFixture() {
        LinearLayout content = UiFactory.column(this);
        content.addView(UiFactory.centeredTarget(this, "RESOURCE_ID_TARGET", R.id.api_ui_id_target));
        Button action = UiFactory.button(this, "Call Java fixture", R.id.api_java_action_single);
        action.setOnClickListener(view -> {
            SdkFixtureState state = SdkFixtureState.getInstance();
            state.single("ui-action");
            state.emitDebugLog();
        });
        content.addView(action);
        return content;
    }

    private View pathFixture() {
        LinearLayout content = UiFactory.column(this);
        LinearLayout parent = UiFactory.card(this);
        parent.setId(R.id.api_ui_nested_parent);

        TextView first = UiFactory.centeredTarget(this, getString(R.string.api_duplicate_text), R.id.api_ui_text_first);
        first.setTag("api-text-first");
        parent.addView(first);

        TextView tagged = UiFactory.centeredTarget(this, "TAG_TARGET", R.id.api_ui_tag_target);
        tagged.setTag("api-tag-target");
        parent.addView(tagged);

        Button child = UiFactory.button(this, "NESTED_CHILD", R.id.api_ui_nested_child);
        child.setTag("api-nested-child");
        parent.addView(child);
        content.addView(parent);

        TextView second = UiFactory.centeredTarget(this, getString(R.string.api_duplicate_text), R.id.api_ui_text_second);
        second.setTag("api-text-second");
        content.addView(second);
        TextView outside = UiFactory.centeredTarget(this, "NESTED_CHILD", R.id.api_ui_same_id_outside);
        outside.setTag("api-nested-child");
        content.addView(outside);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        return scroll;
    }

    private View visibilityFixture() {
        LinearLayout content = UiFactory.column(this);
        TextView hidden = UiFactory.centeredTarget(this, "INVISIBLE", R.id.api_ui_hidden);
        hidden.setVisibility(View.INVISIBLE);
        content.addView(hidden);

        TextView gone = UiFactory.centeredTarget(this, "GONE", R.id.api_ui_gone);
        gone.setVisibility(View.GONE);
        content.addView(gone);

        Button disabled = UiFactory.button(this, "DISABLED", R.id.api_ui_disabled);
        disabled.setEnabled(false);
        content.addView(disabled);

        TextView zero = UiFactory.label(this, "ZERO_SIZE");
        zero.setId(R.id.api_ui_zero_size);
        content.addView(zero, new LinearLayout.LayoutParams(0, 0));
        return content;
    }

    private View runtimeWrapperFixture() {
        LinearLayout content = UiFactory.column(this);
        ApiDemoCustomView custom = new ApiDemoCustomView(this);
        custom.setId(R.id.api_ui_custom_view);
        content.addView(custom, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                UiFactory.dp(this, 180)));
        return content;
    }
}
