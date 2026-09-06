package com.example.helloworld.ui.home;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;

import com.example.helloworld.R;
import com.example.helloworld.feature.FeatureFlagProvider;
import com.example.helloworld.session.AuthSession;
import com.example.helloworld.ui.auth.AuthActivity;

public class HomeActivity extends Activity {
    private final FeatureFlagProvider featureFlagProvider = new FeatureFlagProvider();
    private int sampleActionCount;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_home);

        TextView welcome = findViewById(R.id.home_welcome);
        TextView account = findViewById(R.id.home_account);
        TextView count = findViewById(R.id.counter_value);
        Button increment = findViewById(R.id.counter_increment);
        TextView inspectionStatus = findViewById(R.id.advanced_inspection_status);
        Button inspectionAction = findViewById(R.id.advanced_inspection_action);
        TextView logout = findViewById(R.id.home_logout);

        welcome.setText(getString(R.string.welcome_name, AuthSession.getDisplayName()));
        account.setText(AuthSession.getAccount());
        updateCounter(count);

        increment.setOnClickListener(view -> {
            sampleActionCount += 1;
            updateCounter(count);
            Log.d("HelloWorld", "sampleActionCount=" + sampleActionCount);
        });
        inspectionAction.setOnClickListener(view -> {
            boolean enabled = featureFlagProvider.isAdvancedInspectionEnabled();
            inspectionStatus.setText(enabled
                    ? R.string.advanced_inspection_status_enabled
                    : R.string.advanced_inspection_status_disabled);
            inspectionStatus.setContentDescription(getString(enabled
                    ? R.string.advanced_inspection_status_enabled
                    : R.string.advanced_inspection_status_disabled));
            Log.d("HelloWorld", "advancedInspectionEnabled=" + enabled);
        });
        logout.setOnClickListener(view -> {
            AuthSession.logout();
            startActivity(new Intent(this, AuthActivity.class));
            finish();
        });
    }

    private void updateCounter(TextView countView) {
        countView.setText(String.valueOf(sampleActionCount));
        countView.setContentDescription(getString(R.string.focus_count_description, sampleActionCount));
    }
}
