package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.view.View;

import com.agenteasyuse.mobileeasyuse.apidemo.R;

import java.util.LinkedHashMap;

public final class OverrideActivity extends CapabilityActivity {
    @Override protected String capabilityName() { return "Override"; }
    @Override protected int rootId() { return R.id.api_override_root; }
    @Override protected int titleId() { return R.id.api_override_title; }
    @Override protected int scenarioId() { return R.id.api_override_scenario; }
    @Override protected int readyId() { return R.id.api_override_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_override_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("single", "Single method replacement");
        target.put("overload", "Exact overload replacement");
        target.put("filter", "Invocation argument filter");
        target.put("async_cleanup", "Async scope cleanup");
    }

    @Override
    protected View createFixture(String scenario) {
        String description;
        switch (scenario) {
            case "single":
                description = "Override one Java method and verify restoration.";
                break;
            case "overload":
                description = "Override only the selected Java overload.";
                break;
            case "filter":
                description = "Override only invocations accepted by a filter.";
                break;
            case "async_cleanup":
                description = "Keep an override until asynchronous work settles.";
                break;
            default:
                throw new IllegalArgumentException("Unknown Override scenario: " + scenario);
        }
        return UiFactory.centeredTarget(this, description, R.id.api_override_fixture_target);
    }
}
