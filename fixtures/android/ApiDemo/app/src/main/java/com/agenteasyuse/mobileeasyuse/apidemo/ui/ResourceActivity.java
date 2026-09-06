package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.view.View;
import android.widget.LinearLayout;

import com.agenteasyuse.mobileeasyuse.apidemo.R;

import java.util.LinkedHashMap;

public final class ResourceActivity extends CapabilityActivity {
    @Override protected String capabilityName() { return "R / Resources"; }
    @Override protected int rootId() { return R.id.api_resource_root; }
    @Override protected int titleId() { return R.id.api_resource_title; }
    @Override protected int scenarioId() { return R.id.api_resource_scenario; }
    @Override protected int readyId() { return R.id.api_resource_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_resource_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("resolve", "Resolve ID and string");
        target.put("missing", "Missing resource returns zero");
    }

    @Override
    protected View createFixture(String scenario) {
        if (!"resolve".equals(scenario) && !"missing".equals(scenario)) {
            throw new IllegalArgumentException("Unknown Resource scenario: " + scenario);
        }
        LinearLayout content = UiFactory.column(this);
        content.addView(UiFactory.centeredTarget(
                this,
                getString(R.string.api_resource_string),
                R.id.api_resource_id_target));
        return content;
    }
}
