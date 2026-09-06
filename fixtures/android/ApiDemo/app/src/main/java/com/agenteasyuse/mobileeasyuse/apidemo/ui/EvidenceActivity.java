package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.R;
import com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState;
import com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState;

import java.util.LinkedHashMap;

public final class EvidenceActivity extends CapabilityActivity {
    @Override protected String capabilityName() { return "Evidence"; }
    @Override protected int rootId() { return R.id.api_evidence_root; }
    @Override protected int titleId() { return R.id.api_evidence_title; }
    @Override protected int scenarioId() { return R.id.api_evidence_scenario; }
    @Override protected int readyId() { return R.id.api_evidence_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_evidence_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("state", "State before and after action");
        target.put("ui", "UI before and after action");
        target.put("chain", "Java method and log chain");
    }

    @Override
    protected View createFixture(String scenario) {
        switch (scenario) {
            case "state": return stateFixture();
            case "ui": return uiFixture();
            case "chain": return chainFixture();
            default: throw new IllegalArgumentException("Unknown Evidence scenario: " + scenario);
        }
    }

    private View stateFixture() {
        LinearLayout content = UiFactory.column(this);
        TextView value = UiFactory.label(this, "clickCount=0");
        value.setId(R.id.api_evidence_state_value);
        Button action = UiFactory.button(this, "Increment state", R.id.api_evidence_state_click);
        action.setOnClickListener(view -> {
            ApiDemoState.getInstance().incrementClick();
            SdkFixtureState.getInstance().increment();
            value.setText("clickCount=" + ApiDemoState.getInstance().getClickCount());
        });
        content.addView(action);
        content.addView(value);
        return content;
    }

    private View uiFixture() {
        LinearLayout content = UiFactory.column(this);
        TextView hidden = UiFactory.centeredTarget(
                this, "EVIDENCE_HIDDEN", R.id.api_evidence_ui_hidden);
        hidden.setVisibility(View.INVISIBLE);
        Button show = UiFactory.button(this, "Show hidden View", R.id.api_evidence_ui_show);
        show.setOnClickListener(view -> hidden.setVisibility(View.VISIBLE));
        content.addView(hidden);
        content.addView(show);
        return content;
    }

    private View chainFixture() {
        LinearLayout content = UiFactory.column(this);
        TextView value = UiFactory.label(this, "No chain captured");
        value.setId(R.id.api_evidence_chain_value);
        Button action = UiFactory.button(this, "Emit Java and log chain", R.id.api_evidence_chain_action);
        action.setOnClickListener(view -> {
            SdkFixtureState state = SdkFixtureState.getInstance();
            String result = state.single("chain");
            state.emitDebugLog();
            state.emitOtherTagLog();
            state.emitNoiseLog();
            value.setText(result);
        });
        content.addView(action);
        content.addView(value);
        return content;
    }
}
