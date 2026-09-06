package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.R;

import java.util.LinkedHashMap;

public final class WaitActivity extends CapabilityActivity {
    private FrameLayout attachContainer;
    private View attachTarget;

    @Override protected String capabilityName() { return "Wait"; }
    @Override protected int rootId() { return R.id.api_wait_root; }
    @Override protected int titleId() { return R.id.api_wait_title; }
    @Override protected int scenarioId() { return R.id.api_wait_scenario; }
    @Override protected int readyId() { return R.id.api_wait_ready; }
    @Override protected int fixtureContainerId() { return R.id.api_wait_fixture_container; }

    @Override
    protected void defineScenarios(LinkedHashMap<String, String> target) {
        target.put("immediate", "Already existing and visible");
        target.put("delayed_visible", "Hidden target becomes visible");
        target.put("delayed_gone", "Visible target becomes gone");
        target.put("attach_detach", "Attach and detach a View instance");
        target.put("resize", "Zero-size target becomes visible");
        target.put("timeout", "Condition never changes");
    }

    @Override
    protected View createFixture(String scenario) {
        attachContainer = null;
        attachTarget = null;
        LinearLayout content = UiFactory.column(this);
        switch (scenario) {
            case "immediate":
                content.addView(UiFactory.centeredTarget(this, "EXISTING", R.id.api_wait_existing));
                break;
            case "delayed_visible": {
                TextView target = UiFactory.centeredTarget(this, "DELAYED_VISIBLE", R.id.api_wait_hidden);
                target.setVisibility(View.INVISIBLE);
                content.addView(target);
                break;
            }
            case "delayed_gone":
                content.addView(UiFactory.centeredTarget(this, "DELAYED_GONE", R.id.api_wait_gone));
                break;
            case "attach_detach": {
                attachContainer = new FrameLayout(this);
                attachContainer.setId(R.id.api_wait_attach_container);
                content.addView(attachContainer, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        UiFactory.dp(this, 180)));
                attachTarget = UiFactory.centeredTarget(this, "ATTACH_TARGET", R.id.api_wait_attach_target);
                TextView detachTarget = UiFactory.centeredTarget(this, "DETACH_TARGET", R.id.api_wait_detach_target);
                attachContainer.addView(detachTarget);
                break;
            }
            case "resize": {
                TextView target = UiFactory.label(this, "RESIZE_TARGET");
                target.setId(R.id.api_wait_zero_size);
                content.addView(target, new LinearLayout.LayoutParams(0, 0));
                break;
            }
            case "timeout": {
                TextView target = UiFactory.centeredTarget(this, "NEVER_VISIBLE", R.id.api_wait_never);
                target.setVisibility(View.INVISIBLE);
                content.addView(target);
                break;
            }
            default: throw new IllegalArgumentException("Unknown Wait scenario: " + scenario);
        }
        return content;
    }

    @Override
    protected void applyFixtureAction(String fixtureKey, String action) {
        if ("api_wait_attach_target".equals(fixtureKey) && "attach".equals(action)) {
            if (attachTarget != null && attachTarget.getParent() == null) {
                attachContainer.addView(attachTarget);
            }
            return;
        }
        super.applyFixtureAction(fixtureKey, action);
    }
}
