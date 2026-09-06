package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.ApiDemoRuntime;
import com.agenteasyuse.mobileeasyuse.apidemo.R;
import com.agenteasyuse.mobileeasyuse.apidemo.control.ApiDemoController;
import com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState;
import com.agenteasyuse.mobileeasyuse.apidemo.state.SdkFixtureState;

import java.util.LinkedHashMap;
import java.util.Map;

public abstract class CapabilityActivity extends Activity {
    private final Handler fixtureHandler = new Handler(Looper.getMainLooper());
    private final LinkedHashMap<String, String> scenarios = new LinkedHashMap<>();
    private FrameLayout fixtureContainer;
    private TextView scenarioView;
    private TextView readyView;
    private String scenarioKey;

    protected abstract String capabilityName();
    protected abstract int rootId();
    protected abstract int titleId();
    protected abstract int scenarioId();
    protected abstract int readyId();
    protected abstract int fixtureContainerId();
    protected abstract void defineScenarios(LinkedHashMap<String, String> target);
    protected abstract View createFixture(String scenario);

    @Override
    protected final void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ApiDemoRuntime.initializeIfRequested(this);
        defineScenarios(scenarios);
        createShell();
        ApiDemoController.register(this);
        String requested = getIntent().getStringExtra("scenario");
        if (requested == null || requested.isEmpty()) {
            showCatalog();
        } else {
            showScenario(requested);
        }
    }

    @Override
    protected final void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String requested = intent.getStringExtra("scenario");
        if (requested == null || requested.isEmpty()) {
            showCatalog();
        } else {
            showScenario(requested);
        }
    }

    @Override
    protected void onDestroy() {
        cleanupFixture();
        fixtureHandler.removeCallbacksAndMessages(null);
        ApiDemoController.unregister(this);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (scenarioKey != null) {
            showCatalog();
            return;
        }
        super.onBackPressed();
    }

    private void createShell() {
        LinearLayout root = UiFactory.column(this);
        root.setId(rootId());
        root.setBackgroundColor(getColor(R.color.api_background));

        TextView title = UiFactory.title(this, capabilityName());
        title.setId(titleId());
        root.addView(title);

        scenarioView = UiFactory.label(this, "catalog");
        scenarioView.setId(scenarioId());
        root.addView(scenarioView);

        readyView = UiFactory.label(this, "not-ready");
        readyView.setId(readyId());
        root.addView(readyView);

        fixtureContainer = new FrameLayout(this);
        fixtureContainer.setId(fixtureContainerId());
        root.addView(fixtureContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));
        setContentView(root);
    }

    public final void showCatalog() {
        cleanupFixture();
        fixtureHandler.removeCallbacksAndMessages(null);
        scenarioKey = null;
        scenarioView.setText("catalog");
        int generation = ApiDemoState.getInstance().reset(capabilityName(), "catalog");
        SdkFixtureState.getInstance().reset();
        readyView.setText(getString(R.string.api_ready_format, generation));
        fixtureContainer.removeAllViews();

        LinearLayout list = UiFactory.column(this);
        for (Map.Entry<String, String> entry : scenarios.entrySet()) {
            Button item = UiFactory.button(this, entry.getValue(), View.generateViewId());
            String key = entry.getKey();
            item.setContentDescription("scenario:" + key);
            item.setOnClickListener(view -> showScenario(key));
            list.addView(item, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        ScrollView scroll = new ScrollView(this);
        scroll.addView(list);
        fixtureContainer.addView(scroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    public final void showScenario(String requested) {
        if (!scenarios.containsKey(requested)) {
            cleanupFixture();
            fixtureHandler.removeCallbacksAndMessages(null);
            scenarioKey = requested;
            scenarioView.setText(requested);
            readyView.setText("error:unknown-scenario");
            fixtureContainer.removeAllViews();
            fixtureContainer.addView(UiFactory.label(this, "Unknown scenario: " + requested));
            return;
        }
        scenarioKey = requested;
        resetCurrentScenario();
    }

    public final int resetCurrentScenario() {
        if (scenarioKey == null || !scenarios.containsKey(scenarioKey)) {
            throw new IllegalStateException("No active ApiDemo scenario");
        }
        cleanupFixture();
        fixtureHandler.removeCallbacksAndMessages(null);
        int generation = ApiDemoState.getInstance().reset(capabilityName(), scenarioKey);
        SdkFixtureState.getInstance().reset();
        scenarioView.setText(scenarioKey);
        readyView.setText("building");
        fixtureContainer.removeAllViews();
        View fixture = createFixture(scenarioKey);
        fixtureContainer.addView(fixture, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        fixture.post(() -> {
            if (generation == ApiDemoState.getInstance().getGeneration()) {
                readyView.setText(getString(R.string.api_ready_format, generation));
            }
        });
        return generation;
    }

    public final String getScenarioKey() {
        return scenarioKey;
    }

    public final View getFixtureView(int resourceId) {
        return findViewById(resourceId);
    }

    public View getDetachedFixtureView() {
        return null;
    }

    public final void scheduleFixtureAction(String fixtureKey, String action, long delayMs) {
        if (delayMs < 0) {
            throw new IllegalArgumentException("delayMs must be non-negative");
        }
        int generation = ApiDemoState.getInstance().getGeneration();
        fixtureHandler.postDelayed(() -> {
            if (generation == ApiDemoState.getInstance().getGeneration()) {
                applyFixtureAction(fixtureKey, action);
            }
        }, delayMs);
    }

    protected void applyFixtureAction(String fixtureKey, String action) {
        int resourceId = getResources().getIdentifier(fixtureKey, "id", getPackageName());
        View view = resourceId == 0 ? null : findViewById(resourceId);
        if (view == null) {
            throw new IllegalArgumentException("Fixture view not found: " + fixtureKey);
        }
        switch (action) {
            case "show":
                view.setVisibility(View.VISIBLE);
                break;
            case "hide":
                view.setVisibility(View.GONE);
                break;
            case "invisible":
                view.setVisibility(View.INVISIBLE);
                break;
            case "detach":
                if (view.getParent() instanceof ViewGroup) {
                    ((ViewGroup) view.getParent()).removeView(view);
                }
                break;
            case "resize":
                view.getLayoutParams().width = UiFactory.dp(this, 64);
                view.getLayoutParams().height = UiFactory.dp(this, 64);
                view.requestLayout();
                break;
            default:
                throw new IllegalArgumentException("Unsupported fixture action: " + action);
        }
    }

    protected void cleanupFixture() {
    }
}
